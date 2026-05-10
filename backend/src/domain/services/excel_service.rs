use std::{collections::HashMap, io::Cursor, sync::Arc};

use calamine::{open_workbook_auto_from_rs, Data, Reader};
use csv::ReaderBuilder;
use encoding_rs::WINDOWS_1252;
use futures_util::{stream, StreamExt};
use serde::Serialize;

use crate::domain::{
    errors::DomainError,
    models::group::Group,
    services::{
        building_service::BuildingService,
        classroom_service::ClassroomService,
        group_service::GroupService,
        schedule_service::{CreateScheduleSlot, ScheduleService},
        subject_service::SubjectService,
        teacher_service::TeacherService,
    },
};

const ROW_CONCURRENCY: usize = 16;

#[derive(Default)]
struct CatalogIndex {
    subjects_by_code: HashMap<String, i32>,
    teachers_by_employee: HashMap<String, i32>,
    buildings_by_name: HashMap<String, i32>,
    classrooms_by_building_and_name: HashMap<(i32, String), i32>,
    /// Both root groups (parent_id = None) and subgroups, keyed by (parent_id, lowercased name).
    groups_by_parent_and_name: HashMap<(Option<i32>, String), Group>,
}

fn norm_key(value: &str) -> String {
    value.trim().to_lowercase()
}

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

    /// Build a single in-memory snapshot of every catalog the upload pipeline
    /// touches. Without this, each row of the file would scan the full catalog
    /// once (O(N×M) round-trips); with it the per-row hot path is pure CPU.
    async fn build_catalog_index(&self) -> Result<CatalogIndex, DomainError> {
        let (subjects, teachers, buildings, classrooms, groups) = futures_util::try_join!(
            self.subject_service.find_all(),
            self.teacher_service.find_all(),
            self.building_service.find_all(),
            self.classroom_service.find_all(),
            self.group_service.find_all(),
        )?;

        let mut index = CatalogIndex::default();
        for subject in subjects {
            index
                .subjects_by_code
                .insert(norm_key(&subject.code), subject.id);
        }
        for teacher in teachers {
            index
                .teachers_by_employee
                .insert(norm_key(&teacher.employee_number), teacher.id);
        }
        for building in buildings {
            index
                .buildings_by_name
                .insert(norm_key(&building.name), building.id);
        }
        for classroom in classrooms {
            if let Some(building_id) = classroom.building_id {
                index
                    .classrooms_by_building_and_name
                    .insert((building_id, norm_key(&classroom.name)), classroom.id);
            }
        }
        for group in groups {
            index
                .groups_by_parent_and_name
                .insert((group.parent_id, norm_key(&group.name)), group);
        }
        Ok(index)
    }

    pub async fn process_schedule_file(
        &self,
        file: &[u8],
        uploaded_by: Option<uuid::Uuid>,
    ) -> Result<ExcelImportResult, DomainError> {
        let ParsedScheduleTable { headers, rows } = parse_uploaded_schedule_table(file)?;
        let index = Arc::new(self.build_catalog_index().await?);
        let analyses = self.analyze_rows_concurrent(&headers, &rows, index.clone()).await?;

        // Build the slot list in one pass. Groups created on the fly are memoized
        // into a local cache so the same group is not re-resolved per row.
        let mut group_cache: HashMap<(Option<i32>, String), Group> = HashMap::new();
        let mut errors = Vec::new();
        let mut slot_inputs: Vec<CreateScheduleSlot> = Vec::new();
        for (idx, analysis) in analyses.into_iter().enumerate() {
            let row_number = idx + 2;
            if !analysis.errors.is_empty() {
                errors.push(format!("Fila {row_number}: {}", analysis.errors.join("; ")));
                continue;
            }
            match self
                .build_slot_input(analysis.parsed, &index, &mut group_cache, uploaded_by)
                .await
            {
                Ok(input) => slot_inputs.push(input),
                Err(e) => errors.push(format!("Fila {row_number}: {}", e.msg())),
            }
        }

        let processed = slot_inputs.len();
        if !slot_inputs.is_empty() {
            if let Err(e) = self.schedule_service.create_many_resolved(slot_inputs).await {
                errors.push(format!("Error al guardar horarios: {}", e.msg()));
                return Ok(ExcelImportResult {
                    success: false,
                    processed: 0,
                    errors,
                });
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
        // If parsing as Excel/CSV fails with a BadRequest (structural/formatting issues),
        // return a successful HTTP-level response that contains the parse error message
        // in the preview details. Other domain errors are still propagated.
        let parsed_table = match parse_uploaded_schedule_table(file) {
            Ok(t) => t,
            Err(DomainError::BadRequest(msg)) => {
                return Ok(ExcelPreviewResult {
                    success: false,
                    processed: 0,
                    errors: vec![msg],
                    rows: vec![],
                })
            }
            Err(e) => return Err(e),
        };

        let ParsedScheduleTable { headers, rows } = parsed_table;
        let index = Arc::new(self.build_catalog_index().await?);
        let analyses = self.analyze_rows_concurrent(&headers, &rows, index).await?;

        let mut processed = 0usize;
        let mut errors = Vec::new();
        let mut preview_rows = Vec::with_capacity(analyses.len());

        for (idx, analysis) in analyses.into_iter().enumerate() {
            let row_number = idx + 2;

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

    async fn analyze_rows_concurrent(
        &self,
        headers: &[String],
        rows: &[Vec<String>],
        index: Arc<CatalogIndex>,
    ) -> Result<Vec<RowAnalysis>, DomainError> {
        let headers = Arc::new(headers.to_vec());
        let futures = rows.iter().cloned().map(|row| {
            let headers = headers.clone();
            let index = index.clone();
            async move { self.analyze_row(&headers, &row, &index).await }
        });

        stream::iter(futures)
            .buffered(ROW_CONCURRENCY)
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect()
    }

    async fn analyze_row(
        &self,
        headers: &[String],
        row: &[String],
        index: &CatalogIndex,
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
                self.append_row_analysis(&parsed, index, &mut errors, &mut warnings).await?;
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
        self.append_row_analysis(&parsed, index, &mut errors, &mut warnings).await?;

        Ok(RowAnalysis { parsed, errors, warnings })
    }

    async fn append_row_analysis(
        &self,
        parsed: &ParsedScheduleRow,
        index: &CatalogIndex,
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
            if !index
                .subjects_by_code
                .contains_key(&norm_key(&parsed.clave_materia))
            {
                errors.push(format!("Materia no encontrada: {}", parsed.clave_materia));
            }
        }

        let mut teacher_id = None;
        if !parsed.no_empleado.is_empty() {
            match index
                .teachers_by_employee
                .get(&norm_key(&parsed.no_empleado))
            {
                Some(id) => teacher_id = Some(*id),
                None => errors.push(format!("Docente no encontrado: {}", parsed.no_empleado)),
            }
        }

        let mut classroom_id = None;
        if !parsed.edificio.is_empty() {
            match index.buildings_by_name.get(&norm_key(&parsed.edificio)) {
                Some(building_id) => {
                    if !parsed.aula.is_empty() {
                        match index
                            .classrooms_by_building_and_name
                            .get(&(*building_id, norm_key(&parsed.aula)))
                        {
                            Some(id) => classroom_id = Some(*id),
                            None => errors.push(format!(
                                "Salón no encontrado: {} en {}",
                                parsed.aula, parsed.edificio
                            )),
                        }
                    }
                }
                None => {
                    errors.push(format!("Edificio no encontrado: {}", parsed.edificio));
                    if !parsed.aula.is_empty() {
                        // Surface the classroom error too so the upload popover can
                        // queue both for creation in a single round-trip; otherwise
                        // the user would have to create the building, re-preview,
                        // and only then see the missing classroom.
                        errors.push(format!(
                            "Salón no encontrado: {} en {}",
                            parsed.aula, parsed.edificio
                        ));
                    }
                }
            }
        }

        // Validate groups and subgroups independently of classroom existence
        // so all missing items are reported in a single pass
        if !parsed.grupo.is_empty() {
            match index
                .groups_by_parent_and_name
                .get(&(None, norm_key(&parsed.grupo)))
            {
                Some(group) => {
                    if let (Some(file_grade), Some(group_grade)) = (parsed.grade, group.grade) {
                        if file_grade != group_grade {
                            warnings.push(format!(
                                "Grado del archivo ({}) no coincide con el del grupo {} ({}); se conservará el del grupo.",
                                file_grade, group.name, group_grade
                            ));
                        }
                    }
                    let subgroup = if let Some(subgroup_name) = parsed.subgroup.as_deref() {
                        match index
                            .groups_by_parent_and_name
                            .get(&(Some(group.id), norm_key(subgroup_name)))
                        {
                            Some(existing) => Some(existing.name.clone()),
                            None => {
                                errors.push(format!(
                                    "Subgrupo no encontrado: {} en {}",
                                    subgroup_name, group.name
                                ));
                                None
                            }
                        }
                    } else {
                        None
                    };

                    // Collision checking still requires classroom to exist
                    if !has_time_error {
                        if let Some(c_id) = classroom_id {
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
                None => {
                    errors.push(format!("Grupo no encontrado: {}", parsed.grupo));
                    if let Some(subgroup_name) = parsed.subgroup.as_deref() {
                        errors.push(format!(
                            "Subgrupo no encontrado: {} en {}",
                            subgroup_name, parsed.grupo
                        ));
                    }
                }
            }
        }

        Ok(())
    }

    async fn build_slot_input(
        &self,
        parsed: ParsedScheduleRow,
        index: &CatalogIndex,
        group_cache: &mut HashMap<(Option<i32>, String), Group>,
        uploaded_by: Option<uuid::Uuid>,
    ) -> Result<CreateScheduleSlot, DomainError> {
        let subject_id = *index
            .subjects_by_code
            .get(&norm_key(&parsed.clave_materia))
            .ok_or_else(|| DomainError::NotFound("Materia no encontrada".to_string()))?;
        let teacher_id = *index
            .teachers_by_employee
            .get(&norm_key(&parsed.no_empleado))
            .ok_or_else(|| DomainError::NotFound("Docente no encontrado".to_string()))?;
        let building_id = *index
            .buildings_by_name
            .get(&norm_key(&parsed.edificio))
            .ok_or_else(|| DomainError::NotFound("Edificio no encontrado".to_string()))?;
        let classroom_id = *index
            .classrooms_by_building_and_name
            .get(&(building_id, norm_key(&parsed.aula)))
            .ok_or_else(|| DomainError::NotFound("Salón no encontrado".to_string()))?;

        let group = self
            .resolve_or_create_group(&parsed.grupo, None, parsed.grade, index, group_cache)
            .await?;

        let subgroup = if let Some(subgroup_name) = parsed.subgroup.as_deref() {
            let subgroup = self
                .resolve_or_create_group(subgroup_name, Some(group.id), None, index, group_cache)
                .await?;
            Some(subgroup.name)
        } else {
            None
        };

        Ok(CreateScheduleSlot {
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
    }

    async fn resolve_or_create_group(
        &self,
        name: &str,
        parent_id: Option<i32>,
        grade: Option<i32>,
        index: &CatalogIndex,
        group_cache: &mut HashMap<(Option<i32>, String), Group>,
    ) -> Result<Group, DomainError> {
        let key = (parent_id, norm_key(name));
        if let Some(group) = group_cache.get(&key) {
            return Ok(group.clone());
        }
        if let Some(group) = index.groups_by_parent_and_name.get(&key) {
            return Ok(group.clone());
        }
        let created = self
            .group_service
            .find_or_create(name, parent_id, grade)
            .await?;
        group_cache.insert(key, created.clone());
        Ok(created)
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
    // Attempt to parse CSV assuming UTF-8 first. If that fails, try WINDOWS-1252
    let csv_string = match std::str::from_utf8(file) {
        Ok(s) => s.to_string(),
        Err(_) => {
            // Fallback to Windows-1252 (common for Excel-exported CSVs on Windows)
            let (decoded, _, _had_errors) = WINDOWS_1252.decode(file);
            decoded.into_owned()
        }
    };

    let mut reader = ReaderBuilder::new()
        .flexible(true)
        .from_reader(csv_string.as_bytes());

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
        Data::Float(v) => excel_fraction_to_time(*v).unwrap_or_else(|| v.to_string()),
        Data::Int(v) => v.to_string(),
        Data::Bool(v) => v.to_string(),
        Data::DateTime(v) => excel_fraction_to_time(v.as_f64()).unwrap_or_else(|| v.to_string()),
        Data::DateTimeIso(v) => v.clone(),
        Data::DurationIso(v) => v.clone(),
        Data::Empty | Data::Error(_) => String::new(),
    }
}

// Excel encodes time-of-day as a fraction of a day in [0, 1). Datetimes >= 1
// carry a date component; we keep only the fractional part to extract HH:MM:SS.
// Returns None for plain integers and out-of-range values so non-time numerics
// (e.g. grade "1") keep their numeric string form.
fn excel_fraction_to_time(value: f64) -> Option<String> {
    if !value.is_finite() || value < 0.0 {
        return None;
    }
    let frac = value.fract();
    if frac == 0.0 {
        return None;
    }
    let total_secs = (frac * 86_400.0).round() as i64;
    let h = (total_secs / 3600) % 24;
    let m = (total_secs / 60) % 60;
    let s = total_secs % 60;
    Some(format!("{:02}:{:02}:{:02}", h, m, s))
}
