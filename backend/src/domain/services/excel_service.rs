use std::{io::Cursor, sync::Arc};

use calamine::{open_workbook_auto_from_rs, Data, Reader};
use csv::ReaderBuilder;

use crate::domain::{
    errors::DomainError,
    models::{building::Building, classroom::Classroom},
    services::{
        building_service::BuildingService,
        classroom_service::ClassroomService,
        group_service::GroupService,
        schedule_service::{CreateScheduleSlot, ScheduleService},
        subject_service::SubjectService,
        teacher_service::TeacherService,
    },
};

#[derive(Clone)]
pub struct ExcelService {
    teacher_service: Arc<TeacherService>,
    subject_service: Arc<SubjectService>,
    building_service: Arc<BuildingService>,
    classroom_service: Arc<ClassroomService>,
    group_service: Arc<GroupService>,
    schedule_service: Arc<ScheduleService>,
}

#[derive(Clone)]
pub struct ExcelImportResult {
    pub success: bool,
    pub processed: usize,
    pub errors: Vec<String>,
}

struct ParsedScheduleTable {
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
}

impl ExcelService {
    pub fn new(
        teacher_service: Arc<TeacherService>,
        subject_service: Arc<SubjectService>,
        building_service: Arc<BuildingService>,
        classroom_service: Arc<ClassroomService>,
        group_service: Arc<GroupService>,
        schedule_service: Arc<ScheduleService>,
    ) -> Self {
        Self {
            teacher_service,
            subject_service,
            building_service,
            classroom_service,
            group_service,
            schedule_service,
        }
    }

    pub async fn process_schedule_file(
        &self,
        file: &[u8],
        uploaded_by: Option<uuid::Uuid>,
    ) -> Result<ExcelImportResult, DomainError> {
        let ParsedScheduleTable { headers, rows } = parse_uploaded_schedule_table(file)?;

        let mut processed = 0usize;
        let mut errors = Vec::new();
        for (idx, row) in rows.iter().enumerate() {
            let row_number = idx + 2;
            match self.process_row(&headers, row, uploaded_by).await {
                Ok(_) => processed += 1,
                Err(e) => errors.push(format!("Fila {row_number}: {}", e.msg())),
            }
        }

        Ok(ExcelImportResult {
            success: errors.is_empty(),
            processed,
            errors,
        })
    }

    async fn process_row(
        &self,
        headers: &[String],
        row: &[String],
        uploaded_by: Option<uuid::Uuid>,
    ) -> Result<(), DomainError> {
        let value = |names: &[&str]| -> String {
            headers
                .iter()
                .position(|h| names.iter().any(|name| h.eq_ignore_ascii_case(name)))
                .and_then(|i| row.get(i))
                .map(|v| v.trim().to_string())
                .unwrap_or_default()
        };

        let clave_materia = value(&["ClaveMateria"]);
        let materia = value(&["Materia"]);
        let grade = parse_optional_grade(&value(&["Grado", "Grade"]))?;
        let no_empleado = value(&["NoEmpleado"]);
        let docente = value(&["Docente"]);
        let grupo = value(&["Grupo"]);
        let subgroup = value(&["Subgrupo", "SubGrupo"]);
        let aula = value(&["Aula"]);
        let edificio = value(&["Edificio"]);
        let dia = value(&["Dia"]);
        let hora_inicio = normalize_time(&value(&["HoraInicio"]));
        let hora_fin = normalize_time(&value(&["HoraFin"]));

        if clave_materia.is_empty()
            || materia.is_empty()
            || grupo.is_empty()
            || aula.is_empty()
            || edificio.is_empty()
            || dia.is_empty()
            || hora_inicio.is_empty()
            || hora_fin.is_empty()
        {
            return Err(DomainError::BadRequest(
                "Se requiere ClaveMateria, Materia, Grupo, Aula, Edificio, Dia, HoraInicio y HoraFin".to_string(),
            ));
        }

        let subject = match self.subject_service.create(
            &clave_materia,
            if materia.is_empty() { "Materia Sin Nombre" } else { &materia },
            grade,
            None,
        ).await {
            Ok(v) => v,
            Err(DomainError::Conflict(_)) => {
                let existing = self.subject_service.find_all().await?.into_iter().find(|s| s.code == clave_materia).ok_or_else(|| DomainError::NotFound("Materia no encontrada".to_string()))?;

                if existing.grade.is_none() && grade.is_some() {
                    let _ = self.subject_service.update(existing.id, None, None, grade, None).await?;
                }

                existing
            },
            Err(e) => return Err(e),
        };

        let teacher_id = if no_empleado.is_empty() && docente.is_empty() {
            None
        } else {
            let emp = if no_empleado.is_empty() { format!("SIN_NUM_{}", chrono::Utc::now().timestamp_millis()) } else { no_empleado };
            let teacher = match self.teacher_service.create(&emp, if docente.is_empty() { "Docente Por Asignar" } else { &docente }, None).await {
                Ok(v) => v,
                Err(DomainError::Conflict(_)) => self.teacher_service.find_all().await?.into_iter().find(|t| t.employee_number == emp).ok_or_else(|| DomainError::NotFound("Docente no encontrado".to_string()))?,
                Err(e) => return Err(e),
            };

            Some(teacher.id)
        };

        let building = resolve_or_create_building(&self.building_service, &edificio).await?;

        let classroom = resolve_or_create_classroom(&self.classroom_service, &aula, building.id).await?;

        let group = match self.group_service.create(&grupo, None).await {
            Ok(v) => v,
            Err(DomainError::Conflict(_)) => self.group_service.find_all().await?.into_iter().find(|g| g.name == grupo).ok_or_else(|| DomainError::NotFound("Grupo no encontrado".to_string()))?,
            Err(e) => return Err(e),
        };

        let day_of_week = parse_day(&dia);

        self.schedule_service
            .create(CreateScheduleSlot {
                teacher_id,
                subject_id: subject.id,
                classroom_id: classroom.id,
                group_id: group.id,
                day_of_week,
                start_time: hora_inicio,
                end_time: if hora_fin.is_empty() { "00:00:00".to_string() } else { hora_fin },
                subgroup: if subgroup.is_empty() { None } else { Some(subgroup) },
                is_published: false,
                created_by_id: uploaded_by,
            })
            .await?;

        Ok(())
    }
}

async fn resolve_or_create_building(service: &BuildingService, name: &str) -> Result<Building, DomainError> {
    match service.create(name, None).await {
        Ok(building) => Ok(building),
        Err(DomainError::Conflict(_)) => service
            .find_by_name(name)
            .await?
            .ok_or_else(|| DomainError::NotFound("Edificio no encontrado".to_string())),
        Err(err) => Err(err),
    }
}

async fn resolve_or_create_classroom(
    service: &ClassroomService,
    name: &str,
    building_id: i32,
) -> Result<Classroom, DomainError> {
    match service.create(name, Some(building_id)).await {
        Ok(classroom) => Ok(classroom),
        Err(DomainError::Conflict(_)) => service
            .find_by_name_and_building(name, building_id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Salon no encontrado".to_string())),
        Err(err) => Err(err),
    }
}

fn parse_day(day: &str) -> i32 {
    let d = day.to_lowercase();
    if d.contains("lun") { return 1; }
    if d.contains("mar") { return 2; }
    if d.contains("mie") || d.contains("mié") { return 3; }
    if d.contains("jue") { return 4; }
    if d.contains("vie") { return 5; }
    if d.contains("sab") || d.contains("sáb") { return 6; }
    0
}

fn normalize_time(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }
    if value.contains(':') {
        let mut parts: Vec<&str> = value.split(':').collect();
        while parts.len() < 3 {
            parts.push("00");
        }
        return format!("{:0>2}:{:0>2}:{:0>2}", parts[0], parts[1], parts[2]);
    }
    "00:00:00".to_string()
}

fn parse_optional_grade(value: &str) -> Result<Option<i32>, DomainError> {
    let normalized = value.trim();

    if normalized.is_empty() || normalized.eq_ignore_ascii_case("null") {
        return Ok(None);
    }

    normalized
        .parse::<i32>()
        .map(Some)
        .map_err(|_| DomainError::BadRequest(format!("Grado invalido: {normalized}")))
}

fn parse_uploaded_schedule_table(file: &[u8]) -> Result<ParsedScheduleTable, DomainError> {
    match open_workbook_auto_from_rs(Cursor::new(file.to_vec())) {
        Ok(mut workbook) => {
            let sheet_name = workbook
                .sheet_names()
                .first()
                .cloned()
                .ok_or_else(|| DomainError::BadRequest("El archivo esta vacio".to_string()))?;

            let range = workbook
                .worksheet_range(&sheet_name)
                .map_err(|e| DomainError::BadRequest(format!("No se pudo leer hoja: {e}")))?;

            let mut rows = range.rows();
            let header = rows
                .next()
                .ok_or_else(|| DomainError::BadRequest("El archivo no contiene filas".to_string()))?;

            let headers: Vec<String> = header.iter().map(cell_to_string).map(normalize_header).collect();
            let rows = rows
                .map(|row| row.iter().map(cell_to_string).collect::<Vec<String>>())
                .collect::<Vec<Vec<String>>>();

            Ok(ParsedScheduleTable { headers, rows })
        }
        Err(workbook_error) => parse_uploaded_csv(file).map_err(|csv_error| {
            DomainError::BadRequest(format!(
                "No se pudo leer el archivo como Excel ni CSV: {workbook_error}; {csv_error}"
            ))
        }),
    }
}

fn parse_uploaded_csv(file: &[u8]) -> Result<ParsedScheduleTable, String> {
    let mut reader = ReaderBuilder::new()
        .flexible(true)
        .from_reader(Cursor::new(file));

    let headers_record = reader
        .headers()
        .map_err(|e| format!("No se pudo leer encabezados CSV: {e}"))?
        .clone();

    let headers = headers_record
        .iter()
        .map(|header| normalize_header(header.to_string()))
        .collect::<Vec<String>>();

    let mut rows = Vec::new();
    for record in reader.records() {
        let record = record.map_err(|e| format!("No se pudo leer una fila CSV: {e}"))?;
        rows.push(record.iter().map(|cell| cell.trim().to_string()).collect());
    }

    Ok(ParsedScheduleTable { headers, rows })
}

fn normalize_header(value: String) -> String {
    value.trim_start_matches('\u{feff}').trim().to_string()
}

fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::String(v) => v.clone(),
        Data::Float(v) => v.to_string(),
        Data::Int(v) => v.to_string(),
        Data::Bool(v) => v.to_string(),
        Data::DateTime(v) => v.to_string(),
        Data::Empty => String::new(),
        _ => String::new(),
    }
}
