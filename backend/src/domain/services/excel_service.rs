use std::{io::Cursor, sync::Arc};

use calamine::{open_workbook_auto_from_rs, Data, Reader};
use csv::ReaderBuilder;
use serde::Serialize;

use crate::domain::{
    errors::DomainError,
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulePreviewRow {
    pub row_number: usize,
    pub clave_materia: String,
    pub materia: String,
    pub grade: Option<i32>,
    pub no_empleado: String,
    pub docente: String,
    pub grupo: String,
    pub subgroup: Option<String>,
    pub aula: String,
    pub edificio: String,
    pub dia: String,
    pub hora_inicio: String,
    pub hora_fin: String,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Serialize)]
pub struct ExcelPreviewResult {
    pub success: bool,
    pub processed: usize,
    pub errors: Vec<String>,
    pub rows: Vec<SchedulePreviewRow>,
}

struct ParsedScheduleTable {
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
}

struct ParsedScheduleRow {
    clave_materia: String,
    materia: String,
    grade: Option<i32>,
    no_empleado: String,
    docente: String,
    grupo: String,
    subgroup: Option<String>,
    aula: String,
    edificio: String,
    dia: String,
    day_of_week: i32,
    hora_inicio: String,
    hora_fin: String,
}

struct RowAnalysis {
    parsed: ParsedScheduleRow,
    errors: Vec<String>,
    warnings: Vec<String>,
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

    pub async fn preview_schedule_file(
        &self,
        file: &[u8],
    ) -> Result<ExcelPreviewResult, DomainError> {
        let ParsedScheduleTable { headers, rows } = parse_uploaded_schedule_table(file)?;

        let mut processed = 0usize;
        let mut errors = Vec::new();
        let mut preview_rows = Vec::new();

        for (idx, row) in rows.iter().enumerate() {
            let row_number = idx + 2;
            let analysis = self.analyze_row(&headers, row).await?;

            if analysis.errors.is_empty() {
                processed += 1;
            } else {
                errors.push(format!("Fila {row_number}: {}", analysis.errors.join("; ")));
            }

            preview_rows.push(SchedulePreviewRow {
                row_number,
                clave_materia: analysis.parsed.clave_materia,
                materia: analysis.parsed.materia,
                grade: analysis.parsed.grade,
                no_empleado: analysis.parsed.no_empleado,
                docente: analysis.parsed.docente,
                grupo: analysis.parsed.grupo,
                subgroup: analysis.parsed.subgroup,
                aula: analysis.parsed.aula,
                edificio: analysis.parsed.edificio,
                dia: analysis.parsed.dia,
                hora_inicio: analysis.parsed.hora_inicio,
                hora_fin: analysis.parsed.hora_fin,
                errors: analysis.errors,
                warnings: analysis.warnings,
            });
        }

        Ok(ExcelPreviewResult {
            success: errors.is_empty(),
            processed,
            errors,
            rows: preview_rows,
        })
    }

    async fn analyze_row(
        &self,
        headers: &[String],
        row: &[String],
    ) -> Result<RowAnalysis, DomainError> {
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
        let grade = match parse_optional_grade(&value(&["Grado", "Grade"])) {
            Ok(v) => v,
            Err(err) => {
                let mut errors = vec![err.msg()];
                let parsed = ParsedScheduleRow {
                    clave_materia,
                    materia,
                    grade: None,
                    no_empleado: value(&["NoEmpleado"]),
                    docente: value(&["Docente"]),
                    grupo: value(&["Grupo"]),
                    subgroup: parse_optional_text(&value(&["Subgrupo", "SubGrupo"])),
                    aula: value(&["Aula"]),
                    edificio: value(&["Edificio"]),
                    dia: value(&["Dia"]),
                    day_of_week: 0,
                    hora_inicio: normalize_time(&value(&["HoraInicio"])),
                    hora_fin: normalize_time(&value(&["HoraFin"])),
                };
                let mut warnings = Vec::new();
                self.append_row_analysis(&parsed, &mut errors, &mut warnings).await?;
                return Ok(RowAnalysis { parsed, errors, warnings });
            }
        };

        let parsed = ParsedScheduleRow {
            clave_materia,
            materia,
            grade,
            no_empleado: value(&["NoEmpleado"]),
            docente: value(&["Docente"]),
            grupo: value(&["Grupo"]),
            subgroup: parse_optional_text(&value(&["Subgrupo", "SubGrupo"])),
            aula: value(&["Aula"]),
            edificio: value(&["Edificio"]),
            dia: value(&["Dia"]),
            day_of_week: parse_day(&value(&["Dia"])),
            hora_inicio: normalize_time(&value(&["HoraInicio"])),
            hora_fin: normalize_time(&value(&["HoraFin"])),
        };

        let mut errors = Vec::new();
        let mut warnings = Vec::new();
        self.append_row_analysis(&parsed, &mut errors, &mut warnings).await?;

        Ok(RowAnalysis { parsed, errors, warnings })
    }

    async fn append_row_analysis(
        &self,
        parsed: &ParsedScheduleRow,
        errors: &mut Vec<String>,
        warnings: &mut Vec<String>,
    ) -> Result<(), DomainError> {
        let mut has_time_error = false;
        
        if parsed.clave_materia.is_empty() {
            errors.push("Se requiere ClaveMateria".to_string());
        }

        if parsed.materia.is_empty() {
            errors.push("Se requiere Materia".to_string());
        }

        if parsed.no_empleado.is_empty() {
            errors.push("Se requiere NoEmpleado".to_string());
        }

        if parsed.grupo.is_empty() {
            errors.push("Se requiere Grupo".to_string());
        }

        if parsed.aula.is_empty() {
            errors.push("Se requiere Aula".to_string());
        }

        if parsed.edificio.is_empty() {
            errors.push("Se requiere Edificio".to_string());
        }

        if parsed.dia.is_empty() {
            errors.push("Se requiere Dia".to_string());
            has_time_error = true;
        } else if parsed.day_of_week == 0 {
            errors.push(format!("Día inválido: {}", parsed.dia));
            has_time_error = true;
        }

        if parsed.hora_inicio.is_empty() {
            errors.push("Se requiere HoraInicio".to_string());
            has_time_error = true;
        }

        if parsed.hora_fin.is_empty() {
            errors.push("Se requiere HoraFin".to_string());
            has_time_error = true;
        }

        if !has_time_error
            && parse_time_minutes(&parsed.hora_inicio) >= parse_time_minutes(&parsed.hora_fin)
        {
            errors.push("La hora de inicio debe ser menor que la hora de fin".to_string());
            has_time_error = true;
        }

        if !parsed.clave_materia.is_empty() {
            match self.find_subject_id(&parsed.clave_materia).await? {
                Some(_) => {}
                None => errors.push(format!("Materia no encontrada: {}", parsed.clave_materia)),
            }
        }

        let mut teacher_id = None;
        if !parsed.no_empleado.is_empty() {
            match self.find_teacher_id(&parsed.no_empleado).await? {
                Some(id) => teacher_id = Some(id),
                None => errors.push(format!("Docente no encontrado: {}", parsed.no_empleado)),
            }
        }

        let mut classroom_id = None;
        if !parsed.edificio.is_empty() {
            match self.find_building_id(&parsed.edificio).await? {
                Some(building_id) => {
                    if !parsed.aula.is_empty() {
                        match self.find_classroom_id(&parsed.aula, building_id).await? {
                            Some(id) => classroom_id = Some(id),
                            None => errors.push(format!(
                                "Salón no encontrado: {} en {}",
                                parsed.aula, parsed.edificio
                            )),
                        }
                    }
                }
                None => errors.push(format!("Edificio no encontrado: {}", parsed.edificio)),
            }
        }
        
        if !has_time_error {
            if let Some(c_id) = classroom_id {
                let group = self
                    .group_service
                    .find_by_name_and_parent(&parsed.grupo, None)
                    .await?;

                if let Some(group) = group {
                    let subgroup = if let Some(subgroup_name) = parsed.subgroup.as_deref() {
                        self.group_service
                            .find_by_name_and_parent(subgroup_name, Some(group.id))
                            .await?
                            .map(|existing| existing.name)
                    } else {
                        None
                    };

                    let collision_res = self.schedule_service.handle_collisions(
                        teacher_id,
                        c_id,
                        group.id,
                        subgroup.as_deref(),
                        parsed.day_of_week,
                        &parsed.hora_inicio,
                        &parsed.hora_fin,
                        None,
                        false,
                    ).await;

                    if let Err(DomainError::Conflict(msg)) = collision_res {
                        warnings.push(format!("{}, se sobreescribirá.", msg));
                    }
                }
            }
        }

        Ok(())
    }

    async fn find_subject_id(&self, code: &str) -> Result<Option<i32>, DomainError> {
        Ok(self
            .subject_service
            .find_all()
            .await?
            .into_iter()
            .find(|subject| subject.code.eq_ignore_ascii_case(code))
            .map(|subject| subject.id))
    }

    async fn find_teacher_id(&self, employee_number: &str) -> Result<Option<i32>, DomainError> {
        Ok(self
            .teacher_service
            .find_all()
            .await?
            .into_iter()
            .find(|teacher| {
                teacher
                    .employee_number
                    .eq_ignore_ascii_case(employee_number)
            })
            .map(|teacher| teacher.id))
    }

    async fn find_building_id(&self, name: &str) -> Result<Option<i32>, DomainError> {
        Ok(self
            .building_service
            .find_by_name(name)
            .await?
            .map(|building| building.id))
    }

    async fn find_classroom_id(
        &self,
        name: &str,
        building_id: i32,
    ) -> Result<Option<i32>, DomainError> {
        Ok(self
            .classroom_service
            .find_by_name_and_building(name, building_id)
            .await?
            .map(|classroom| classroom.id))
    }

    async fn process_row(
        &self,
        headers: &[String],
        row: &[String],
        uploaded_by: Option<uuid::Uuid>,
    ) -> Result<(), DomainError> {
        let analysis = self.analyze_row(headers, row).await?;

        if !analysis.errors.is_empty() {
            return Err(DomainError::BadRequest(analysis.errors.join("; ")));
        }

        let parsed = analysis.parsed;
        let subject_id = self
            .find_subject_id(&parsed.clave_materia)
            .await?
            .ok_or_else(|| DomainError::NotFound("Materia no encontrada".to_string()))?;
        let teacher_id = self
            .find_teacher_id(&parsed.no_empleado)
            .await?
            .ok_or_else(|| DomainError::NotFound("Docente no encontrado".to_string()))?;
        let building_id = self
            .find_building_id(&parsed.edificio)
            .await?
            .ok_or_else(|| DomainError::NotFound("Edificio no encontrado".to_string()))?;
        let classroom_id = self
            .find_classroom_id(&parsed.aula, building_id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Salón no encontrado".to_string()))?;

        let group = self
            .group_service
            .find_or_create(&parsed.grupo, None, parsed.grade)
            .await?;

        let subgroup = if let Some(subgroup_name) = parsed.subgroup.as_deref() {
            Some(
                self.group_service
                    .find_or_create(subgroup_name, Some(group.id), parsed.grade)
                    .await?
                    .name,
            )
        } else {
            None
        };

        self.schedule_service
            .create(CreateScheduleSlot {
                teacher_id: Some(teacher_id),
                subject_id,
                classroom_id,
                group_id: group.id,
                day_of_week: parsed.day_of_week,
                start_time: parsed.hora_inicio,
                end_time: parsed.hora_fin,
                subgroup,
                is_published: false,
                created_by_id: uploaded_by,
                overwrite: true,
            })
            .await?;

        Ok(())
    }
}

fn parse_day(day: &str) -> i32 {
    let d = day.to_lowercase();
    if d.contains("lun") {
        return 1;
    }
    if d.contains("mar") {
        return 2;
    }
    if d.contains("mie") || d.contains("mié") {
        return 3;
    }
    if d.contains("jue") {
        return 4;
    }
    if d.contains("vie") {
        return 5;
    }
    if d.contains("sab") || d.contains("sáb") {
        return 6;
    }
    if d.starts_with("dom") {
        return 7;
    }
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
        .map_err(|_| DomainError::BadRequest(format!("Grado inválido: {normalized}")))
}

fn parse_optional_text(value: &str) -> Option<String> {
    let normalized = value.trim();

    if normalized.is_empty() || normalized.eq_ignore_ascii_case("null") {
        return None;
    }

    Some(normalized.to_string())
}

fn parse_time_minutes(value: &str) -> i32 {
    let mut parts = value.split(':');
    let hour = parts
        .next()
        .and_then(|part| part.parse::<i32>().ok())
        .unwrap_or(0);
    let minute = parts
        .next()
        .and_then(|part| part.parse::<i32>().ok())
        .unwrap_or(0);

    (hour * 60) + minute
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
            let header = rows.next().ok_or_else(|| {
                DomainError::BadRequest("El archivo no contiene filas".to_string())
            })?;

            let headers: Vec<String> = header
                .iter()
                .map(cell_to_string)
                .map(normalize_header)
                .collect();
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
