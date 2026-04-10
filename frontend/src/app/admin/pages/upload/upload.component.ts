import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { NotificationService } from '../../../shared/services/notification.service';
import { getGraphQLErrorMessage } from '../../../shared/utils/graphql-error';
import { normalizeCatalogText } from '../../../shared/utils/catalog-query';
import {
    IonContent,
    IonCard,
    IonCardContent,
    IonButton,
    IonIcon,
    IonProgressBar,
    IonBadge,
    IonChip,
    IonSpinner,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cloudUploadOutline, documentTextOutline, warningOutline } from 'ionicons/icons';
import { environment } from '../../../../environments/environment';

interface UploadPreviewRow {
    rowNumber: number;
    claveMateria: string;
    materia: string;
    grade: number | null;
    noEmpleado: string;
    docente: string;
    grupo: string;
    subgroup: string | null;
    aula: string;
    edificio: string;
    dia: string;
    horaInicio: string;
    horaFin: string;
    errors: string[];
}

interface UploadPreviewResponse {
    message: string;
    details: {
        success: boolean;
        processed: number;
        errors: string[];
        rows: UploadPreviewRow[];
    };
}

interface UploadResponse {
    message: string;
    details: {
        success: boolean;
        processed: number;
        errors: string[];
    };
}

type MissingCatalogType = 'subject' | 'teacher' | 'building' | 'classroom';

interface MissingCatalogItem {
    type: MissingCatalogType;
    key: string;
    row: UploadPreviewRow;
    rowNumbers: number[];
}

interface ExistingCatalogState {
    subjects: Map<string, number>;
    teachers: Map<string, number>;
    buildings: Map<string, number>;
    classrooms: Map<string, number>;
}

const GET_SUBJECTS = gql`
    query GetSubjects {
        GetSubjects {
            id
            code
            name
            grade
        }
    }
`;

const GET_TEACHERS = gql`
    query GetTeachers {
        GetTeachers {
            id
            employeeNumber
            name
            email
        }
    }
`;

const GET_BUILDINGS = gql`
    query GetBuildings {
        GetBuildings {
            id
            name
        }
    }
`;

const GET_CLASSROOMS = gql`
    query GetClassrooms {
        GetClassrooms {
            id
            name
            building {
                id
                name
            }
        }
    }
`;

const CREATE_SUBJECT = gql`
    mutation CreateSubject($input: CreateSubjectInput!) {
        CreateSubject(input: $input) {
            id
            code
            name
        }
    }
`;

const CREATE_TEACHER = gql`
    mutation CreateTeacher($input: CreateTeacherInput!) {
        CreateTeacher(input: $input) {
            id
            employeeNumber
            name
        }
    }
`;

const CREATE_BUILDING = gql`
    mutation CreateBuilding($input: CreateBuildingInput!) {
        CreateBuilding(input: $input) {
            id
            name
        }
    }
`;

const CREATE_CLASSROOM = gql`
    mutation CreateClassroom($input: CreateClassroomInput!) {
        CreateClassroom(input: $input) {
            id
            name
        }
    }
`;

@Component({
    selector: 'app-upload',
    standalone: true,
    imports: [
        CommonModule,
        IonContent,
        IonCard,
        IonCardContent,
        IonButton,
        IonIcon,
        IonProgressBar,
        IonBadge,
        IonChip,
        IonSpinner,
        PageHeaderComponent
    ],
    template: `
        <app-page-header title="Carga de Horarios" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding upload-content">
            <div class="app-page-shell app-page-shell--wide upload-shell">
                <ion-card class="upload-hero-card app-page-section">
                    <ion-card-content>
                        <div class="upload-hero">
                            <div class="upload-hero__copy">
                                <div class="upload-hero__icon">
                                    <ion-icon name="cloud-upload-outline" class="upload-icon"></ion-icon>
                                </div>

                                <div>
                                    <p class="upload-kicker">Importación</p>
                                    <h2>Verifica el archivo antes de confirmar</h2>
                                    <p class="upload-description">
                                        Primero analizamos cada fila, mostramos los errores y solo entonces habilitamos la carga final.
                                    </p>
                                </div>

                                <div class="upload-status-bar">
                                    <ion-chip color="primary">{{ previewRows.length }} filas</ion-chip>
                                    <ion-chip color="success">{{ validRowCount }} válidas</ion-chip>
                                    <ion-chip color="danger">{{ errorRowCount }} con error</ion-chip>
                                </div>

                                <input
                                    type="file"
                                    #fileInput
                                    (change)="OnFileSelected($event)"
                                    accept=".xlsx, .csv"
                                    class="upload-file-input">

                                <div class="upload-actions">
                                    <ion-button expand="block" (click)="fileInput.click()" [disabled]="isPreviewLoading || isConfirmLoading">
                                        <ion-icon name="document-text-outline" slot="start"></ion-icon>
                                        {{ selectedFile ? 'Cambiar archivo' : 'Seleccionar archivo' }}
                                    </ion-button>

                                    <ion-button expand="block" fill="outline" color="medium" (click)="PreviewUpload()" [disabled]="!selectedFile || isPreviewLoading || isConfirmLoading">
                                        {{ isPreviewLoading ? 'Analizando...' : 'Reanalizar' }}
                                    </ion-button>
                                </div>

                                <ion-progress-bar *ngIf="isPreviewLoading" type="indeterminate" class="upload-progress"></ion-progress-bar>
                            </div>

                            <div class="upload-hero__guide">
                                <p class="upload-kicker">Columnas esperadas</p>
                                <h3 class="upload-guide__title">Estructura del archivo</h3>
                                <div class="upload-column-grid">
                                    <div *ngFor="let column of expectedColumns" class="upload-column" [class.upload-column--required]="column.required">
                                        <span class="upload-column__label">{{ column.label }}</span>
                                        <ion-badge [color]="column.required ? 'primary' : 'medium'">{{ column.required ? 'Requerida' : 'Opcional' }}</ion-badge>
                                    </div>
                                </div>

                                <div *ngIf="selectedFile" class="upload-selected-file">
                                    <strong>{{ selectedFile.name }}</strong>
                                    <span>{{ selectedFile.size | number }} bytes</span>
                                </div>

                            </div>
                        </div>
                    </ion-card-content>
                </ion-card>

                <ion-card class="upload-preview-card app-page-section">
                    <ion-card-content>
                        <div class="upload-preview__header">
                            <div>
                                <p class="upload-kicker">Tabla de verificación</p>
                                <h3 class="upload-preview__title">Registros detectados</h3>
                                <p class="upload-preview__description">
                                    Cada fila se valida contra los campos obligatorios y los catálogos institucionales.
                                </p>
                            </div>

                            <div class="upload-preview__chips">
                                <ion-chip color="primary">{{ previewRows.length }} detectadas</ion-chip>
                                <ion-chip color="success">{{ validRowCount }} listas</ion-chip>
                                <ion-chip color="danger">{{ errorRowCount }} con errores</ion-chip>
                            </div>
                        </div>

                        <div *ngIf="hasMissingCatalogItems()" class="upload-missing-card">
                            <div class="upload-missing-card__header">
                                <div>
                                    <p class="upload-kicker">Catálogos faltantes</p>
                                    <h3 class="upload-missing-card__title">Crear elementos desde el archivo</h3>
                                    <p class="upload-missing-card__description">
                                        Genera materias, docentes, edificios y aulas que aún no existan. Los grupos y subgrupos ya se crean automáticamente al confirmar la carga.
                                    </p>
                                </div>

                                <ion-button
                                    class="upload-missing-card__action"
                                    color="warning"
                                    expand="block"
                                    (click)="CreateMissingCatalogItems()"
                                    [disabled]="isPreviewLoading || isConfirmLoading || isCreatingMissingCatalogs">
                                    <ion-spinner *ngIf="isCreatingMissingCatalogs" name="crescent" slot="start"></ion-spinner>
                                    {{ isCreatingMissingCatalogs ? 'Creando...' : 'Crear faltantes' }}
                                </ion-button>
                            </div>

                            <div class="upload-missing-card__chips">
                                <ion-chip *ngIf="missingSubjects.length" color="warning">{{ missingSubjects.length }} materias</ion-chip>
                                <ion-chip *ngIf="missingTeachers.length" color="warning">{{ missingTeachers.length }} docentes</ion-chip>
                                <ion-chip *ngIf="missingBuildings.length" color="warning">{{ missingBuildings.length }} edificios</ion-chip>
                                <ion-chip *ngIf="missingClassrooms.length" color="warning">{{ missingClassrooms.length }} aulas</ion-chip>
                            </div>
                        </div>

                        <div *ngIf="isPreviewLoading" class="upload-loading-state">
                            <ion-spinner name="crescent"></ion-spinner>
                            <p>Analizando archivo...</p>
                        </div>

                        <div *ngIf="!isPreviewLoading && !hasPreview" class="upload-empty-state">
                            <ion-icon name="document-text-outline" class="upload-empty-icon"></ion-icon>
                            <h3>Sin previsualización</h3>
                            <p>Selecciona un archivo .xlsx o .csv para revisar sus registros antes de confirmar la carga.</p>
                        </div>

                        <div *ngIf="hasPreview" class="upload-table-wrap">
                            <table class="upload-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Materia</th>
                                        <th>Grupo</th>
                                        <th>Día y hora</th>
                                        <th>Docente</th>
                                        <th>Aula</th>
                                        <th>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr *ngFor="let row of previewRows; trackBy: trackByRow" [class.upload-row--error]="row.errors.length > 0">
                                        <td class="upload-row__index">{{ row.rowNumber }}</td>
                                        <td>
                                            <strong>{{ row.claveMateria }}</strong>
                                            <span>{{ row.materia }}</span>
                                            <small *ngIf="row.grade !== null">Grado {{ row.grade }}</small>
                                        </td>
                                        <td>
                                            <strong>{{ row.grupo }}</strong>
                                            <small *ngIf="row.subgroup">Subgrupo {{ row.subgroup }}</small>
                                        </td>
                                        <td>
                                            <strong>{{ row.dia }}</strong>
                                            <small>{{ formatClock(row.horaInicio) }} - {{ formatClock(row.horaFin) }}</small>
                                        </td>
                                        <td>
                                            <strong>{{ row.noEmpleado }}</strong>
                                            <small>{{ row.docente || 'Sin nombre' }}</small>
                                        </td>
                                        <td>
                                            <strong>{{ row.aula }}</strong>
                                            <small>{{ row.edificio }}</small>
                                        </td>
                                        <td>
                                            <ion-badge [color]="row.errors.length ? 'danger' : 'success'">
                                                {{ row.errors.length ? 'Con error' : 'Lista' }}
                                            </ion-badge>
                                            <div *ngIf="row.errors.length" class="upload-row-errors">
                                                <ion-chip *ngFor="let error of row.errors" color="danger">{{ error }}</ion-chip>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div *ngIf="previewResult?.details?.errors?.length" class="upload-summary-error">
                            <ion-icon name="warning-outline"></ion-icon>
                            <div>
                                <strong>Hay registros inválidos</strong>
                                <p>Corrige los elementos marcados en rojo para habilitar la confirmación.</p>
                            </div>
                        </div>

                        <div class="upload-actions upload-actions--confirm">
                            <ion-button expand="block" color="success" (click)="Upload()" [disabled]="!canConfirm()">
                                {{ isConfirmLoading ? 'Confirmando...' : 'Confirmar carga' }}
                            </ion-button>
                            <ion-button expand="block" fill="outline" color="medium" (click)="clearSelection(fileInput)" [disabled]="isPreviewLoading || isConfirmLoading">
                                Cambiar archivo
                            </ion-button>
                        </div>

                        <ion-progress-bar *ngIf="isConfirmLoading" type="indeterminate" class="upload-progress"></ion-progress-bar>
                    </ion-card-content>
                </ion-card>
            </div>
        </ion-content>
    `,
    styleUrls: ['./upload.component.scss']
})
export class UploadComponent implements OnInit {
    private apollo = inject(Apollo);
    private http = inject(HttpClient);
    private notifications = inject(NotificationService);
    private apiUrl = environment.apiUrl;
    private fileInputElement: HTMLInputElement | null = null;

    expectedColumns = [
        { label: 'ClaveMateria', required: true },
        { label: 'Materia', required: true },
        { label: 'Grado', required: false },
        { label: 'NoEmpleado', required: true },
        { label: 'Docente', required: false },
        { label: 'Grupo', required: true },
        { label: 'Subgrupo', required: false },
        { label: 'Aula', required: true },
        { label: 'Edificio', required: true },
        { label: 'Dia', required: true },
        { label: 'HoraInicio', required: true },
        { label: 'HoraFin', required: true },
    ];

    selectedFile: File | null = null;
    isPreviewLoading = false;
    isConfirmLoading = false;
    isCreatingMissingCatalogs = false;
    previewResult: UploadPreviewResponse | null = null;
    previewRows: UploadPreviewRow[] = [];
    missingSubjects: MissingCatalogItem[] = [];
    missingTeachers: MissingCatalogItem[] = [];
    missingBuildings: MissingCatalogItem[] = [];
    missingClassrooms: MissingCatalogItem[] = [];

    ngOnInit() {
        addIcons({ cloudUploadOutline, documentTextOutline, warningOutline });
    }

    ionViewWillLeave(): void {
        this.isPreviewLoading = false;
        this.isConfirmLoading = false;
    }

    OnFileSelected(event: any) {
        this.fileInputElement = event.target as HTMLInputElement;
        const nextFile = this.fileInputElement.files?.[0] ?? null;

        if (!nextFile) {
            this.clearSelection(this.fileInputElement);
            return;
        }

        if (!this.isAllowedFile(nextFile)) {
            this.notifications.warning('Solo se permiten archivos .xlsx o .csv.', 'Archivo no válido', { autoDismissMs: 0 });
            this.clearSelection(this.fileInputElement);
            return;
        }

        this.selectedFile = nextFile;
        this.previewResult = null;
        this.previewRows = [];
        this.refreshMissingCatalogItems();
        void this.PreviewUpload();
    }

    clearSelection(input: HTMLInputElement | null = this.fileInputElement) {
        this.selectedFile = null;
        this.previewResult = null;
        this.previewRows = [];
        this.refreshMissingCatalogItems();
        this.isPreviewLoading = false;
        this.isConfirmLoading = false;

        if (input) {
            input.value = '';
        }
    }

    private isAllowedFile(file: File): boolean {
        return /\.(xlsx|csv)$/i.test(file.name);
    }

    hasPreview(): boolean {
        return this.previewRows.length > 0;
    }

    get validRowCount(): number {
        return this.previewRows.filter((row) => row.errors.length === 0).length;
    }

    get errorRowCount(): number {
        return this.previewRows.filter((row) => row.errors.length > 0).length;
    }

    canConfirm(): boolean {
        return !!this.selectedFile
            && this.hasPreview()
            && !!this.previewResult?.details.success
            && !this.isPreviewLoading
            && !this.isConfirmLoading;
    }

    hasMissingCatalogItems(): boolean {
        return this.missingSubjects.length > 0
            || this.missingTeachers.length > 0
            || this.missingBuildings.length > 0
            || this.missingClassrooms.length > 0;
    }

    formatClock(value: string): string {
        return value ? value.substring(0, 5) : '';
    }

    trackByRow(index: number, row: UploadPreviewRow): number {
        return row.rowNumber;
    }

    async PreviewUpload(announceResult = true): Promise<boolean> {
        if (!this.selectedFile || this.isPreviewLoading || this.isConfirmLoading) {
            return false;
        }

        this.isPreviewLoading = true;
        this.previewResult = null;
        this.previewRows = [];
        this.refreshMissingCatalogItems();

        const formData = new FormData();
        formData.append('file', this.selectedFile);

        try {
            const res = await firstValueFrom(this.http.post<UploadPreviewResponse>(`${this.apiUrl}/academic/upload-schedule/preview`, formData));

            this.previewResult = res;
            this.previewRows = res.details.rows ?? [];
            this.refreshMissingCatalogItems();

            if (announceResult) {
                if (res.details.errors.length > 0) {
                    this.notifications.warning(
                        `Se detectaron ${res.details.errors.length} error(es) en ${this.previewRows.length} filas.`,
                        'Revisión necesaria',
                        { autoDismissMs: 0 }
                    );
                } else {
                    this.notifications.success(
                        `Se analizaron ${res.details.processed} registros correctamente.`,
                        'Archivo listo'
                    );
                }
            }

            return true;
        } catch (err: any) {
            this.notifications.danger('Error en la previsualización: ' + (err?.error?.message || err?.message), 'Error en la previsualización', { autoDismissMs: 0 });
            return false;
        } finally {
            this.isPreviewLoading = false;
        }
    }

    async CreateMissingCatalogItems(): Promise<void> {
        if (!this.hasMissingCatalogItems() || this.isPreviewLoading || this.isConfirmLoading || this.isCreatingMissingCatalogs) {
            return;
        }

        const confirmed = await this.notifications.confirm({
            title: 'Crear catálogos faltantes',
            message: `Se crearán ${this.buildMissingCatalogSummary()} a partir del archivo. Los grupos y subgrupos ya se generan automáticamente al confirmar la carga.`,
            confirmText: 'Crear',
            cancelText: 'Cancelar',
            confirmColor: 'warning',
        });

        if (!confirmed) {
            return;
        }

        const missingSubjects = [...this.missingSubjects].sort((left, right) => left.rowNumbers[0] - right.rowNumbers[0]);
        const missingTeachers = [...this.missingTeachers].sort((left, right) => left.rowNumbers[0] - right.rowNumbers[0]);
        const missingBuildings = [...this.missingBuildings].sort((left, right) => left.rowNumbers[0] - right.rowNumbers[0]);
        const missingClassrooms = [...this.missingClassrooms].sort((left, right) => left.rowNumbers[0] - right.rowNumbers[0]);

        this.isCreatingMissingCatalogs = true;

        try {
            const state = await this.loadCurrentCatalogState();
            const createdCounts = {
                subjects: 0,
                teachers: 0,
                buildings: 0,
                classrooms: 0,
            };
            const failures: string[] = [];

            for (const item of missingBuildings) {
                const buildingKey = this.buildCatalogKey(item.row.edificio);
                if (state.buildings.has(buildingKey)) {
                    continue;
                }

                try {
                    const buildingId = await this.createBuilding(item.row.edificio);
                    state.buildings.set(buildingKey, buildingId);
                    createdCounts.buildings += 1;
                } catch (error) {
                    if (this.isDuplicateCatalogError(error)) {
                        const resolvedBuildingId = await this.findBuildingIdByName(item.row.edificio);
                        if (resolvedBuildingId !== null) {
                            state.buildings.set(buildingKey, resolvedBuildingId);
                        } else {
                            failures.push(`No se pudo resolver el edificio ${item.row.edificio} después de detectar un duplicado.`);
                        }
                    } else {
                        failures.push(getGraphQLErrorMessage(error, `No se pudo crear el edificio ${item.row.edificio}.`));
                    }
                }
            }

            for (const item of missingSubjects) {
                const subjectKey = this.buildCatalogKey(item.row.claveMateria);
                if (state.subjects.has(subjectKey)) {
                    continue;
                }

                try {
                    await this.createSubject(item.row);
                    state.subjects.set(subjectKey, 1);
                    createdCounts.subjects += 1;
                } catch (error) {
                    if (!this.isDuplicateCatalogError(error)) {
                        failures.push(getGraphQLErrorMessage(error, `No se pudo crear la materia ${item.row.claveMateria}.`));
                    }
                }
            }

            for (const item of missingTeachers) {
                const teacherKey = this.buildCatalogKey(item.row.noEmpleado);
                if (state.teachers.has(teacherKey)) {
                    continue;
                }

                try {
                    await this.createTeacher(item.row);
                    state.teachers.set(teacherKey, 1);
                    createdCounts.teachers += 1;
                } catch (error) {
                    if (!this.isDuplicateCatalogError(error)) {
                        failures.push(getGraphQLErrorMessage(error, `No se pudo crear el docente ${item.row.noEmpleado}.`));
                    }
                }
            }

            for (const item of missingClassrooms) {
                const buildingKey = this.buildCatalogKey(item.row.edificio);
                const classroomKey = this.buildClassroomKey(item.row.edificio, item.row.aula);
                const buildingId = state.buildings.get(buildingKey);

                if (!buildingId) {
                    failures.push(`No se pudo resolver el edificio ${item.row.edificio} para crear el aula ${item.row.aula}.`);
                    continue;
                }

                if (state.classrooms.has(classroomKey)) {
                    continue;
                }

                try {
                    await this.createClassroom(item.row, buildingId);
                    state.classrooms.set(classroomKey, 1);
                    createdCounts.classrooms += 1;
                } catch (error) {
                    if (!this.isDuplicateCatalogError(error)) {
                        failures.push(getGraphQLErrorMessage(error, `No se pudo crear el aula ${item.row.aula} en ${item.row.edificio}.`));
                    }
                }
            }

            const previewRefreshed = await this.PreviewUpload(false);
            if (!previewRefreshed) {
                return;
            }

            const createdSummary = this.buildCreatedSummary(createdCounts);
            const hasCreatedItems = createdCounts.subjects > 0
                || createdCounts.teachers > 0
                || createdCounts.buildings > 0
                || createdCounts.classrooms > 0;
            const creationSummary = hasCreatedItems
                ? `Se actualizó ${createdSummary}`
                : 'No se pudieron crear los catálogos faltantes';
            if (failures.length > 0) {
                this.notifications.warning(
                    `${creationSummary}, pero quedaron ${failures.length} incidencia(s) al crear catálogos. ${failures.slice(0, 3).join(' ')}`,
                    'Catálogos parcialmente actualizados',
                    { autoDismissMs: 0 }
                );
            } else if (hasCreatedItems) {
                const remainingErrors = this.previewResult?.details.errors.length ?? 0;
                if (remainingErrors > 0) {
                    this.notifications.success(
                        `Se actualizó ${createdSummary}. Aún quedan ${remainingErrors} error(es) en el archivo por corregir.`,
                        'Catálogos actualizados',
                        { autoDismissMs: 0 }
                    );
                } else {
                    this.notifications.success(
                        `Se actualizó ${createdSummary} y el archivo quedó listo para confirmar.`,
                        'Catálogos actualizados'
                    );
                }
            } else {
                this.notifications.info(
                    'Los catálogos que faltaban ya existían. Se reanalizó el archivo con la información actualizada.',
                    'Sin cambios'
                );
            }
        } catch (error) {
            this.notifications.danger(
                getGraphQLErrorMessage(error, 'No se pudieron crear los catálogos faltantes.'),
                'Error en catálogos',
                { autoDismissMs: 0 }
            );
        } finally {
            this.isCreatingMissingCatalogs = false;
        }
    }

    private refreshMissingCatalogItems(): void {
        const missingItems = this.extractMissingCatalogItems(this.previewRows);
        this.missingSubjects = missingItems.subjects;
        this.missingTeachers = missingItems.teachers;
        this.missingBuildings = missingItems.buildings;
        this.missingClassrooms = missingItems.classrooms;
    }

    private extractMissingCatalogItems(rows: UploadPreviewRow[]): {
        subjects: MissingCatalogItem[];
        teachers: MissingCatalogItem[];
        buildings: MissingCatalogItem[];
        classrooms: MissingCatalogItem[];
    } {
        const subjects = new Map<string, MissingCatalogItem>();
        const teachers = new Map<string, MissingCatalogItem>();
        const buildings = new Map<string, MissingCatalogItem>();
        const classrooms = new Map<string, MissingCatalogItem>();

        for (const row of rows) {
            for (const error of row.errors) {
                const subjectMatch = error.match(/^Materia no encontrada:\s*(.+)$/i);
                if (subjectMatch) {
                    this.registerMissingCatalogItem(subjects, {
                        type: 'subject',
                        key: this.buildCatalogKey(subjectMatch[1]),
                        row,
                        rowNumbers: [row.rowNumber],
                    });
                    continue;
                }

                const teacherMatch = error.match(/^Docente no encontrado:\s*(.+)$/i);
                if (teacherMatch) {
                    this.registerMissingCatalogItem(teachers, {
                        type: 'teacher',
                        key: this.buildCatalogKey(teacherMatch[1]),
                        row,
                        rowNumbers: [row.rowNumber],
                    });
                    continue;
                }

                const buildingMatch = error.match(/^Edificio no encontrado:\s*(.+)$/i);
                if (buildingMatch) {
                    this.registerMissingCatalogItem(buildings, {
                        type: 'building',
                        key: this.buildCatalogKey(buildingMatch[1]),
                        row,
                        rowNumbers: [row.rowNumber],
                    });
                    continue;
                }

                const classroomMatch = error.match(/^(?:Sal[oó]n|Aula) no encontrado:\s*(.+?)\s+en\s+(.+)$/i);
                if (classroomMatch) {
                    this.registerMissingCatalogItem(classrooms, {
                        type: 'classroom',
                        key: this.buildClassroomKey(classroomMatch[2], classroomMatch[1]),
                        row,
                        rowNumbers: [row.rowNumber],
                    });
                }
            }
        }

        return {
            subjects: [...subjects.values()],
            teachers: [...teachers.values()],
            buildings: [...buildings.values()],
            classrooms: [...classrooms.values()],
        };
    }

    private registerMissingCatalogItem(collection: Map<string, MissingCatalogItem>, item: MissingCatalogItem): void {
        const existing = collection.get(item.key);
        if (existing) {
            existing.rowNumbers.push(...item.rowNumbers);
            return;
        }

        collection.set(item.key, item);
    }

    private async loadCurrentCatalogState(): Promise<ExistingCatalogState> {
        const [subjectsResponse, teachersResponse, buildingsResponse, classroomsResponse] = await Promise.all([
            firstValueFrom(this.apollo.query<any>({ query: GET_SUBJECTS, fetchPolicy: 'network-only' })),
            firstValueFrom(this.apollo.query<any>({ query: GET_TEACHERS, fetchPolicy: 'network-only' })),
            firstValueFrom(this.apollo.query<any>({ query: GET_BUILDINGS, fetchPolicy: 'network-only' })),
            firstValueFrom(this.apollo.query<any>({ query: GET_CLASSROOMS, fetchPolicy: 'network-only' })),
        ]);

        return {
            subjects: new Map((subjectsResponse?.data?.GetSubjects ?? []).map((subject: any) => [this.buildCatalogKey(subject.code), Number(subject.id)])),
            teachers: new Map((teachersResponse?.data?.GetTeachers ?? []).map((teacher: any) => [this.buildCatalogKey(teacher.employeeNumber), Number(teacher.id)])),
            buildings: new Map((buildingsResponse?.data?.GetBuildings ?? []).map((building: any) => [this.buildCatalogKey(building.name), Number(building.id)])),
            classrooms: new Map((classroomsResponse?.data?.GetClassrooms ?? []).map((classroom: any) => [this.buildClassroomKey(classroom.building?.name, classroom.name), Number(classroom.id)])),
        };
    }

    private async createSubject(row: UploadPreviewRow): Promise<void> {
        await firstValueFrom(this.apollo.mutate({
            mutation: CREATE_SUBJECT,
            variables: {
                input: {
                    code: row.claveMateria,
                    name: row.materia,
                    grade: row.grade ?? null,
                    division: null,
                },
            },
        }));
    }

    private async createTeacher(row: UploadPreviewRow): Promise<void> {
        await firstValueFrom(this.apollo.mutate({
            mutation: CREATE_TEACHER,
            variables: {
                input: {
                    employeeNumber: row.noEmpleado,
                    name: row.docente,
                    email: null,
                },
            },
        }));
    }

    private async createBuilding(name: string): Promise<number> {
        const response = await firstValueFrom(this.apollo.mutate<any>({
            mutation: CREATE_BUILDING,
            variables: {
                input: {
                    name,
                    description: null,
                },
            },
        }));

        const createdId = Number(response?.data?.CreateBuilding?.id ?? 0);
        if (createdId > 0) {
            return createdId;
        }

        const resolvedId = await this.findBuildingIdByName(name);
        if (resolvedId !== null) {
            return resolvedId;
        }

        throw new Error('No se pudo obtener el identificador del edificio creado.');
    }

    private async findBuildingIdByName(name: string): Promise<number | null> {
        const response = await firstValueFrom(this.apollo.query<any>({
            query: GET_BUILDINGS,
            fetchPolicy: 'network-only',
        }));

        const building = (response?.data?.GetBuildings ?? []).find((item: any) => this.buildCatalogKey(item.name) === this.buildCatalogKey(name));
        if (!building) {
            return null;
        }

        const buildingId = Number(building.id);
        return Number.isFinite(buildingId) && buildingId > 0 ? buildingId : null;
    }

    private async createClassroom(row: UploadPreviewRow, buildingId: number): Promise<void> {
        await firstValueFrom(this.apollo.mutate({
            mutation: CREATE_CLASSROOM,
            variables: {
                input: {
                    name: row.aula,
                    buildingId,
                },
            },
        }));
    }

    private buildMissingCatalogSummary(): string {
        const parts: string[] = [];

        if (this.missingSubjects.length > 0) {
            parts.push(this.buildCountLabel(this.missingSubjects.length, 'materia'));
        }

        if (this.missingTeachers.length > 0) {
            parts.push(this.buildCountLabel(this.missingTeachers.length, 'docente'));
        }

        if (this.missingBuildings.length > 0) {
            parts.push(this.buildCountLabel(this.missingBuildings.length, 'edificio'));
        }

        if (this.missingClassrooms.length > 0) {
            parts.push(this.buildCountLabel(this.missingClassrooms.length, 'aula'));
        }

        return this.joinNaturalList(parts);
    }

    private buildCreatedSummary(counts: { subjects: number; teachers: number; buildings: number; classrooms: number; }): string {
        const parts: string[] = [];

        if (counts.subjects > 0) {
            parts.push(this.buildCountLabel(counts.subjects, 'materia'));
        }

        if (counts.teachers > 0) {
            parts.push(this.buildCountLabel(counts.teachers, 'docente'));
        }

        if (counts.buildings > 0) {
            parts.push(this.buildCountLabel(counts.buildings, 'edificio'));
        }

        if (counts.classrooms > 0) {
            parts.push(this.buildCountLabel(counts.classrooms, 'aula'));
        }

        return this.joinNaturalList(parts);
    }

    private buildCountLabel(count: number, singular: string): string {
        return `${count} ${count === 1 ? singular : `${singular}s`}`;
    }

    private joinNaturalList(parts: string[]): string {
        if (parts.length === 0) {
            return 'ningún elemento';
        }

        if (parts.length === 1) {
            return parts[0];
        }

        if (parts.length === 2) {
            return `${parts[0]} y ${parts[1]}`;
        }

        return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
    }

    private buildCatalogKey(value: string): string {
        return normalizeCatalogText(value);
    }

    private buildClassroomKey(buildingName: string | null | undefined, classroomName: string): string {
        return `${this.buildCatalogKey(buildingName ?? '')}::${this.buildCatalogKey(classroomName)}`;
    }

    private isDuplicateCatalogError(error: unknown): boolean {
        const message = getGraphQLErrorMessage(error, '').toLowerCase();
        return message.includes('ya existe');
    }

    Upload() {
        if (!this.canConfirm()) {
            return;
        }

        this.isConfirmLoading = true;
        const file = this.selectedFile;
        if (!file) {
            this.isConfirmLoading = false;
            return;
        }

        const formData = new FormData();
        formData.append('file', file, file.name);

        this.http.post(`${this.apiUrl}/academic/upload-schedule`, formData)
            .subscribe({
                next: (res: any) => {
                    this.isConfirmLoading = false;
                    const details = res.details ?? res;
                    const processed = Number(details?.processed ?? 0);
                    const errors = Array.isArray(details?.errors) ? details.errors : [];

                    if (errors.length > 0) {
                        const preview = errors.slice(0, 5).join('\n');
                        const title = processed > 0 ? 'Carga parcial' : 'Error en la carga';
                        const message = processed > 0
                            ? `Se procesaron ${processed} registros, pero hubo errores en algunas filas (total: ${errors.length}).\n${preview}`
                            : `Hubo errores en la carga (total: ${errors.length}).\n${preview}`;

                        this.notifications.warning(message, title, { autoDismissMs: 0 });
                    } else {
                        this.notifications.success(`Se procesaron ${processed} registros correctamente.`, 'Carga exitosa');
                    }
                    this.clearSelection();
                },
                error: (err) => {
                    this.isConfirmLoading = false;
                    this.notifications.danger('Error en la carga: ' + (err.error?.message || err.message), 'Error en la carga', { autoDismissMs: 0 });
                }
            });
    }
}
