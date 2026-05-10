import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { NotificationService } from '../../../shared/services/notification.service';
import { PopoverController } from '@ionic/angular';
import { MissingItemsPopoverComponent } from '../../../shared/components/missing-items-popover/missing-items-popover.component';
import { getGraphQLErrorMessage } from '../../../shared/utils/graphql-error';
import { normalizeCatalogText } from '../../../shared/utils/catalog-query';
import { DraggableDirective } from '../../../shared/directives/draggable.directive';
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
    warnings?: string[];
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

type MissingCatalogType = 'subject' | 'teacher' | 'building' | 'classroom' | 'group' | 'subgroup';

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
    groups: Map<string, number>;
    subgroups: Map<string, number>;
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

const GET_GROUPS = gql`
    query GetGroups {
        GetGroups {
            id
            name
            grade
            parent {
                id
                name
            }
        }
    }
`;

const CREATE_GROUP = gql`
    mutation CreateGroup($input: CreateGroupInput!) {
        CreateGroup(input: $input) {
            id
            name
            grade
            parent {
                id
                name
            }
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
        PageHeaderComponent,
        MissingItemsPopoverComponent,
        DraggableDirective
    ],
    template: `
        <app-page-header title="Carga de Horarios" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding upload-content">
            <div class="app-page-shell app-page-shell--wide upload-shell">
                <ion-card class="upload-hero-card app-page-section">
                    <ion-card-content>
                        <div class="upload-hero">
                            <div class="upload-hero__copy">
                                <div class="upload-hero__header">
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
                                        Genera materias, docentes, edificios, aulas y grupos faltantes a partir del archivo.
                                    </p>
                                </div>

                                <div class="upload-missing-card__action-wrap">
                                    <ion-button
                                        class="upload-missing-card__action"
                                        color="warning"
                                        (click)="CreateMissingCatalogItems()"
                                        [disabled]="isPreviewLoading || isConfirmLoading || isCreatingMissingCatalogs">
                                        <ion-spinner *ngIf="isCreatingMissingCatalogs" name="crescent" slot="start"></ion-spinner>
                                        {{ isCreatingMissingCatalogs ? 'Creando...' : 'Crear faltantes' }}
                                    </ion-button>
                                </div>
                            </div>

                            <div class="upload-missing-card__chips">
                                <ion-chip *ngIf="missingSubjects.length" color="warning" (click)="OpenMissingItemsPopover($event, 'subject')">{{ missingSubjects.length }} materias</ion-chip>
                                <ion-chip *ngIf="missingTeachers.length" color="warning" (click)="OpenMissingItemsPopover($event, 'teacher')">{{ missingTeachers.length }} docentes</ion-chip>
                                <ion-chip *ngIf="missingBuildings.length" color="warning" (click)="OpenMissingItemsPopover($event, 'building')">{{ missingBuildings.length }} edificios</ion-chip>
                                <ion-chip *ngIf="missingClassrooms.length" color="warning" (click)="OpenMissingItemsPopover($event, 'classroom')">{{ missingClassrooms.length }} aulas</ion-chip>
                                <ion-chip *ngIf="missingGroups.length" color="warning" (click)="OpenMissingItemsPopover($event, 'group')">{{ missingGroups.length }} grupos</ion-chip>
                                <ion-chip *ngIf="missingSubgroups.length" color="warning" (click)="OpenMissingItemsPopover($event, 'subgroup')">{{ missingSubgroups.length }} subgrupos</ion-chip>
                            </div>
                        </div>

                        <div *ngIf="isPreviewLoading" class="upload-loading-state">
                            <ion-spinner name="crescent"></ion-spinner>
                            <p>Analizando archivo...</p>
                        </div>

                        <div *ngIf="!isPreviewLoading && !hasPreview()" class="upload-empty-state">
                            <ion-icon name="document-text-outline" class="upload-empty-icon"></ion-icon>
                            <h3>Sin previsualización</h3>
                            <p>Selecciona un archivo .xlsx o .csv para revisar sus registros antes de confirmar la carga.</p>
                        </div>

                        <div *ngIf="hasPreview()" class="upload-table-wrap">
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
                                    <tr *ngFor="let row of previewRows; trackBy: trackByRow" 
                                        [class.upload-row--error]="row.errors.length > 0"
                                        [class.upload-row--warning]="row.warnings && row.warnings.length > 0 && row.errors.length === 0">
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
                                            <ion-badge [color]="row.errors.length ? 'danger' : (row.warnings && row.warnings.length ? 'warning' : 'success')">
                                                {{ row.errors.length ? 'Con error' : (row.warnings && row.warnings.length ? 'Se sobreescribirá' : 'Lista') }}
                                            </ion-badge>
                                            <div *ngIf="row.errors.length" class="upload-row-errors">
                                                <ion-chip *ngFor="let error of row.errors" color="danger">{{ error }}</ion-chip>
                                            </div>
                                            <div *ngIf="!row.errors.length && row.warnings && row.warnings.length" class="upload-row-warnings">
                                                <ion-chip *ngFor="let warning of row.warnings" color="warning">{{ warning }}</ion-chip>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div *ngIf="previewResult?.details?.errors?.length" class="upload-summary-error">
                            <ion-icon name="warning-outline"></ion-icon>
                            <div>
                                <strong *ngIf="previewRows.length > 0">Hay registros inválidos</strong>
                                <strong *ngIf="previewRows.length === 0">Error en la previsualización</strong>
                                <p *ngIf="previewRows.length > 0">Corrige los elementos marcados en rojo para habilitar la confirmación.</p>
                                <div class="upload-summary-error-list">
                                    <div *ngFor="let err of previewResult?.details?.errors">
                                        <ion-chip color="danger">{{ err }}</ion-chip>
                                    </div>
                                </div>
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

        <!-- Custom absolute popover so we don't use Ionic's scroll-blocking overlay.
             Renderizado fuera de <ion-content> para que position:fixed sea relativo al
             viewport (ion-content crea su propio stacking context con transform) y el
             z-index compita contra el ion-header. -->
        <div class="upload-custom-popover" *ngIf="activeMissingCategory" appDraggable dragHandleSelector=".missing-popover__header">
            <app-missing-items-popover
                [missingSubjects]="missingSubjects"
                [missingTeachers]="missingTeachers"
                [missingBuildings]="missingBuildings"
                [missingClassrooms]="missingClassrooms"
                [missingGroups]="missingGroups"
                [missingSubgroups]="missingSubgroups"
                [activeCategory]="activeMissingCategory"
                (closed)="PopMissingItemsPopover($event)">
            </app-missing-items-popover>
        </div>
    `,
    styleUrls: ['./upload.component.scss'],
    providers: [PopoverController]
})
export class UploadComponent implements OnInit {
    private apollo = inject(Apollo);
    private http = inject(HttpClient);
    private notifications = inject(NotificationService);
    private popover = inject(PopoverController);
    private apiUrl = environment.apiUrl;
    private fileInputElement: HTMLInputElement | null = null;
    
    activeMissingCategory: MissingCatalogType | 'all' | null = null;

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
    missingGroups: MissingCatalogItem[] = [];
    missingSubgroups: MissingCatalogItem[] = [];

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
            this.notifications.warning('Solo se permiten archivos .xlsx o .csv.', 'Archivo no válido');
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
            || this.missingClassrooms.length > 0
            || this.missingGroups.length > 0
            || this.missingSubgroups.length > 0;
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
            const res = await firstValueFrom(this.http.post<UploadPreviewResponse>(`${this.apiUrl}/api/academic/upload-schedule/preview`, formData));

            this.previewResult = res;
            this.previewRows = res.details.rows ?? [];
            this.refreshMissingCatalogItems();

            if (announceResult) {
                if (res.details.errors.length > 0) {
                    this.notifications.warning(
                        `Se detectaron ${res.details.errors.length} error(es) en ${this.previewRows.length} filas.`,
                        'Revisión necesaria'
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
            this.notifications.danger('Error en la previsualización: ' + (err?.error?.message || err?.message), 'Error en la previsualización');
            return false;
        } finally {
            this.isPreviewLoading = false;
        }
    }

    async OpenMissingItemsPopover(ev?: Event, category: MissingCatalogType | 'all' = 'all'): Promise<void> {
        this.activeMissingCategory = category;
    }

    async PopMissingItemsPopover(data?: any): Promise<void> {
        this.activeMissingCategory = null;
        if (!data) return;

        if (data.action === 'createSelected') {
            await this.createSelectedMissingFromPopover(data.items ?? []);
        } else if (data.action === 'createAll') {
            await this.CreateMissingCatalogItems();
        } else if (data.action === 'editItem') {
            const item = data.item;
            const confirmed = await this.notifications.confirm({
                title: 'Crear elemento',
                message: `¿Crear ${this.missingItemLabel(item)}?`,
                confirmText: 'Crear',
                cancelText: 'Cancelar',
                confirmColor: 'warning',
            });

            if (confirmed) {
                await this.createSelectedMissingFromPopover([item]);
            }
        }
    }

    defaultMissingCatalogCategory(): MissingCatalogType | 'all' {
        if (this.missingGroups.length) return 'group';
        if (this.missingSubgroups.length) return 'subgroup';
        if (this.missingSubjects.length) return 'subject';
        if (this.missingTeachers.length) return 'teacher';
        if (this.missingBuildings.length) return 'building';
        if (this.missingClassrooms.length) return 'classroom';
        return 'all';
    }

    private missingItemLabel(item: MissingCatalogItem): string {
        if (!item) return '';
        switch (item.type) {
            case 'subject':
                return `${item.row.claveMateria} — ${item.row.materia || item.key}`;
            case 'teacher':
                return `${item.row.noEmpleado} — ${item.row.docente || item.key}`;
            case 'building':
                return `${item.row.edificio}`;
            case 'classroom':
                return `${item.row.aula} — ${item.row.edificio}`;
            case 'group':
                return `${item.row.grupo}`;
            case 'subgroup':
                return `${item.row.grupo} / ${item.row.subgroup}`;
        }
    }

    private async createSelectedMissingFromPopover(items: MissingCatalogItem[]): Promise<void> {
        if (!items || items.length === 0) return;

        const counts = items.reduce((acc: any, it) => {
            acc[it.type] = (acc[it.type] || 0) + 1;
            return acc;
        }, {});
        const parts: string[] = [];
        if (counts.subject) parts.push(`${counts.subject} ${counts.subject === 1 ? 'materia' : 'materias'}`);
        if (counts.teacher) parts.push(`${counts.teacher} ${counts.teacher === 1 ? 'docente' : 'docentes'}`);
        if (counts.building) parts.push(`${counts.building} ${counts.building === 1 ? 'edificio' : 'edificios'}`);
        if (counts.classroom) parts.push(`${counts.classroom} ${counts.classroom === 1 ? 'aula' : 'aulas'}`);
        if (counts.group) parts.push(`${counts.group} ${counts.group === 1 ? 'grupo' : 'grupos'}`);
        if (counts.subgroup) parts.push(`${counts.subgroup} ${counts.subgroup === 1 ? 'subgrupo' : 'subgrupos'}`);

        const confirmed = await this.notifications.confirm({
            title: 'Crear catálogos seleccionados',
            message: `Se crearán ${parts.join(', ')} a partir del archivo. ¿Continuar?`,
            confirmText: 'Crear',
            cancelText: 'Cancelar',
            confirmColor: 'warning',
        });

        if (!confirmed) return;

        this.isCreatingMissingCatalogs = true;

        try {
            const state = await this.loadCurrentCatalogState();
            const failures: string[] = [];

            // Track the user's selection by key per type so that, as the preview
            // surfaces newly-detected dependencies (e.g. a parent group only
            // reported once we re-preview), we can keep auto-creating just the
            // items the user opted into. Subgroups implicitly opt their parent
            // groups in — they cannot be created without the parent existing.
            const selectedKeys = {
                building: new Set(items.filter(i => i.type === 'building').map(i => i.key)),
                subject: new Set(items.filter(i => i.type === 'subject').map(i => i.key)),
                teacher: new Set(items.filter(i => i.type === 'teacher').map(i => i.key)),
                classroom: new Set(items.filter(i => i.type === 'classroom').map(i => i.key)),
                group: new Set(items.filter(i => i.type === 'group').map(i => i.key)),
                subgroup: new Set(items.filter(i => i.type === 'subgroup').map(i => i.key)),
            };
            for (const sg of items.filter(i => i.type === 'subgroup')) {
                selectedKeys.group.add(this.buildCatalogKey(sg.row.grupo));
            }

            // Seed missing-* arrays from the current preview once. Subsequent
            // iterations rely on pruneMissingByCreated() to advance state —
            // calling refreshMissingCatalogItems() here would re-parse the stale
            // previewRows and undo the prune.
            this.refreshMissingCatalogItems();

            const maxIterations = 3;
            for (let iteration = 0; iteration < maxIterations; iteration++) {
                const buildings = this.missingBuildings.filter(i => selectedKeys.building.has(i.key));
                const subjects = this.missingSubjects.filter(i => selectedKeys.subject.has(i.key));
                const teachers = this.missingTeachers.filter(i => selectedKeys.teacher.has(i.key));
                const classrooms = this.missingClassrooms.filter(i => selectedKeys.classroom.has(i.key));
                const groups = this.missingGroups.filter(i => selectedKeys.group.has(i.key));
                const subgroups = this.missingSubgroups.filter(i => selectedKeys.subgroup.has(i.key));

                if (buildings.length === 0 && subjects.length === 0 && teachers.length === 0
                    && classrooms.length === 0 && groups.length === 0 && subgroups.length === 0) {
                    break;
                }

                // Phase 1: buildings + subjects + teachers + groups in parallel
                const buildingsTask = Promise.all(buildings.map(async (b) => {
                    const buildingName = b.row.edificio;
                    const buildingKey = this.buildCatalogKey(buildingName);
                    if (state.buildings.has(buildingKey)) return;
                    try {
                        const id = await this.createBuilding(buildingName);
                        state.buildings.set(buildingKey, id);
                    } catch (err: any) {
                        if (this.isDuplicateCatalogError(err)) {
                            const resolved = await this.findBuildingIdByName(buildingName);
                            if (resolved !== null) state.buildings.set(buildingKey, resolved);
                            else failures.push(`No se pudo crear el edificio ${buildingName}.`);
                        } else {
                            failures.push(getGraphQLErrorMessage(err, `No se pudo crear el edificio ${buildingName}.`));
                        }
                    }
                }));

                const subjectsTask = Promise.all(subjects.map(async (s) => {
                    const subjectKey = this.buildCatalogKey(s.row.claveMateria);
                    if (state.subjects.has(subjectKey)) return;
                    try {
                        await this.createSubject(s.row);
                        state.subjects.set(subjectKey, 1);
                    } catch (err: any) {
                        if (!this.isDuplicateCatalogError(err)) failures.push(getGraphQLErrorMessage(err, `No se pudo crear la materia ${s.row.claveMateria}.`));
                    }
                }));

                const teachersTask = Promise.all(teachers.map(async (t) => {
                    const teacherKey = this.buildCatalogKey(t.row.noEmpleado);
                    if (state.teachers.has(teacherKey)) return;
                    try {
                        await this.createTeacher(t.row);
                        state.teachers.set(teacherKey, 1);
                    } catch (err: any) {
                        if (!this.isDuplicateCatalogError(err)) failures.push(getGraphQLErrorMessage(err, `No se pudo crear el docente ${t.row.noEmpleado}.`));
                    }
                }));

                const groupsTask = Promise.all(groups.map(async (g) => {
                    const groupKey = this.buildCatalogKey(g.row.grupo);
                    if (state.groups.has(groupKey)) return;
                    try {
                        const id = await this.createGroup(g.row.grupo, null, g.row.grade ?? null);
                        state.groups.set(groupKey, id);
                    } catch (err: any) {
                        if (this.isDuplicateCatalogError(err)) {
                            const resolved = await this.findGroupIdByName(g.row.grupo, null);
                            if (resolved !== null) state.groups.set(groupKey, resolved);
                            else failures.push(`No se pudo crear el grupo ${g.row.grupo}.`);
                        } else {
                            failures.push(getGraphQLErrorMessage(err, `No se pudo crear el grupo ${g.row.grupo}.`));
                        }
                    }
                }));

                await Promise.all([buildingsTask, subjectsTask, teachersTask, groupsTask]);

                // Phase 2: classrooms (need building) + subgroups (need parent group) in parallel
                const classroomsTask = Promise.all(classrooms.map(async (c) => {
                    const buildingKey = this.buildCatalogKey(c.row.edificio);
                    const classroomKey = this.buildClassroomKey(c.row.edificio, c.row.aula);
                    const buildingId = state.buildings.get(buildingKey);
                    if (!buildingId) {
                        failures.push(`No se pudo resolver el edificio ${c.row.edificio} para crear el aula ${c.row.aula}.`);
                        return;
                    }
                    if (state.classrooms.has(classroomKey)) return;
                    try {
                        await this.createClassroom(c.row, buildingId);
                        state.classrooms.set(classroomKey, 1);
                    } catch (err: any) {
                        if (!this.isDuplicateCatalogError(err)) failures.push(getGraphQLErrorMessage(err, `No se pudo crear el aula ${c.row.aula} en ${c.row.edificio}.`));
                    }
                }));

                const subgroupsTask = Promise.all(subgroups.map(async (sg) => {
                    if (!sg.row.subgroup) return;
                    const parentKey = this.buildCatalogKey(sg.row.grupo);
                    const subgroupKey = this.buildSubgroupKey(sg.row.grupo, sg.row.subgroup);
                    const parentId = state.groups.get(parentKey);
                    if (!parentId) {
                        failures.push(`No se pudo resolver el grupo padre ${sg.row.grupo} para crear el subgrupo ${sg.row.subgroup}.`);
                        return;
                    }
                    if (state.subgroups.has(subgroupKey)) return;
                    try {
                        const id = await this.createGroup(sg.row.subgroup, parentId, null);
                        state.subgroups.set(subgroupKey, id);
                    } catch (err: any) {
                        if (this.isDuplicateCatalogError(err)) {
                            const resolved = await this.findGroupIdByName(sg.row.subgroup, parentId);
                            if (resolved !== null) state.subgroups.set(subgroupKey, resolved);
                            else failures.push(`No se pudo crear el subgrupo ${sg.row.subgroup}.`);
                        } else {
                            failures.push(getGraphQLErrorMessage(err, `No se pudo crear el subgrupo ${sg.row.subgroup}.`));
                        }
                    }
                }));

                await Promise.all([classroomsTask, subgroupsTask]);

                // Update missing-items arrays locally from the in-memory state so the
                // next iteration sees what we already created — re-running PreviewUpload
                // here would re-upload the file and re-run the full backend pipeline
                // (~150-200ms each), which dominates the popover wall-time.
                this.pruneMissingByCreated(state);
            }

            // Single re-preview after the loop so the table reflects the backend
            // truth (collision warnings, etc.) before the user confirms.
            await this.PreviewUpload(false);

            if (failures.length > 0) {
                this.notifications.warning(`Se crearon algunos elementos, pero hubo incidencias: ${failures.slice(0, 3).join(' ')}`, 'Creación parcial');
            } else {
                this.notifications.success('Elementos creados correctamente.', 'Creación completa');
            }
        } catch (err: any) {
            this.notifications.danger(getGraphQLErrorMessage(err, 'No se pudieron crear los elementos seleccionados.'), 'Error');
        } finally {
            this.isCreatingMissingCatalogs = false;
            this.refreshMissingCatalogItems();
        }
    }

    async CreateMissingCatalogItems(): Promise<void> {
        if (!this.hasMissingCatalogItems() || this.isPreviewLoading || this.isConfirmLoading || this.isCreatingMissingCatalogs) {
            return;
        }

        const confirmed = await this.notifications.confirm({
            title: 'Crear catálogos faltantes',
            message: `Se crearán ${this.buildMissingCatalogSummary()} a partir del archivo. ¿Continuar?`,
            confirmText: 'Crear',
            cancelText: 'Cancelar',
            confirmColor: 'warning',
        });

        if (!confirmed) {
            return;
        }

        this.isCreatingMissingCatalogs = true;

        try {
            const overallCreatedCounts = {
                subjects: 0,
                teachers: 0,
                buildings: 0,
                classrooms: 0,
                groups: 0,
                subgroups: 0,
            };
            const overallFailures: string[] = [];
            let progressMade = false;
            const maxIterations = 3;

            const state = await this.loadCurrentCatalogState();

            // Seed once. Iterations advance via pruneMissingByCreated() instead
            // of re-parsing the stale previewRows each time.
            this.refreshMissingCatalogItems();

            for (let iteration = 0; iteration < maxIterations; iteration++) {
                const missingGroups = [...this.missingGroups].sort((a, b) => a.rowNumbers[0] - b.rowNumbers[0]);
                const missingSubgroups = [...this.missingSubgroups].sort((a, b) => a.rowNumbers[0] - b.rowNumbers[0]);
                const missingSubjects = [...this.missingSubjects].sort((a, b) => a.rowNumbers[0] - b.rowNumbers[0]);
                const missingTeachers = [...this.missingTeachers].sort((a, b) => a.rowNumbers[0] - b.rowNumbers[0]);
                const missingBuildings = [...this.missingBuildings].sort((a, b) => a.rowNumbers[0] - b.rowNumbers[0]);
                const missingClassrooms = [...this.missingClassrooms].sort((a, b) => a.rowNumbers[0] - b.rowNumbers[0]);

                if (
                    missingSubjects.length === 0
                    && missingTeachers.length === 0
                    && missingBuildings.length === 0
                    && missingClassrooms.length === 0
                    && missingGroups.length === 0
                    && missingSubgroups.length === 0
                ) {
                    break;
                }

                const createdCounts = { subjects: 0, teachers: 0, buildings: 0, classrooms: 0, groups: 0, subgroups: 0 };
                const failures: string[] = [];

                // Phase 1: groups + buildings + subjects + teachers in parallel (independent).
                const buildingsTask = Promise.all(missingBuildings.map(async (item) => {
                    const buildingKey = this.buildCatalogKey(item.row.edificio);
                    if (state.buildings.has(buildingKey)) return;
                    try {
                        const buildingId = await this.createBuilding(item.row.edificio);
                        state.buildings.set(buildingKey, buildingId);
                        createdCounts.buildings += 1;
                    } catch (error) {
                        if (this.isDuplicateCatalogError(error)) {
                            const resolved = await this.findBuildingIdByName(item.row.edificio);
                            if (resolved !== null) state.buildings.set(buildingKey, resolved);
                            else failures.push(`No se pudo resolver el edificio ${item.row.edificio} después de detectar un duplicado.`);
                        } else {
                            failures.push(getGraphQLErrorMessage(error, `No se pudo crear el edificio ${item.row.edificio}.`));
                        }
                    }
                }));

                const subjectsTask = Promise.all(missingSubjects.map(async (item) => {
                    const subjectKey = this.buildCatalogKey(item.row.claveMateria);
                    if (state.subjects.has(subjectKey)) return;
                    try {
                        await this.createSubject(item.row);
                        state.subjects.set(subjectKey, 1);
                        createdCounts.subjects += 1;
                    } catch (error) {
                        if (!this.isDuplicateCatalogError(error)) {
                            failures.push(getGraphQLErrorMessage(error, `No se pudo crear la materia ${item.row.claveMateria}.`));
                        }
                    }
                }));

                const teachersTask = Promise.all(missingTeachers.map(async (item) => {
                    const teacherKey = this.buildCatalogKey(item.row.noEmpleado);
                    if (state.teachers.has(teacherKey)) return;
                    try {
                        await this.createTeacher(item.row);
                        state.teachers.set(teacherKey, 1);
                        createdCounts.teachers += 1;
                    } catch (error) {
                        if (!this.isDuplicateCatalogError(error)) {
                            failures.push(getGraphQLErrorMessage(error, `No se pudo crear el docente ${item.row.noEmpleado}.`));
                        }
                    }
                }));

                const groupsTask = Promise.all(missingGroups.map(async (item) => {
                    const groupKey = this.buildCatalogKey(item.row.grupo);
                    if (state.groups.has(groupKey)) return;
                    try {
                        const groupId = await this.createGroup(item.row.grupo, null, item.row.grade ?? null);
                        state.groups.set(groupKey, groupId);
                        createdCounts.groups += 1;
                    } catch (error) {
                        if (this.isDuplicateCatalogError(error)) {
                            const resolved = await this.findGroupIdByName(item.row.grupo, null);
                            if (resolved !== null) state.groups.set(groupKey, resolved);
                            else failures.push(`No se pudo resolver el grupo ${item.row.grupo} después de detectar un duplicado.`);
                        } else {
                            failures.push(getGraphQLErrorMessage(error, `No se pudo crear el grupo ${item.row.grupo}.`));
                        }
                    }
                }));

                await Promise.all([buildingsTask, subjectsTask, teachersTask, groupsTask]);

                // Phase 2: classrooms (need building) + subgroups (need parent group) in parallel.
                const classroomsTask = Promise.all(missingClassrooms.map(async (item) => {
                    const buildingKey = this.buildCatalogKey(item.row.edificio);
                    const classroomKey = this.buildClassroomKey(item.row.edificio, item.row.aula);
                    const buildingId = state.buildings.get(buildingKey);
                    if (!buildingId) {
                        failures.push(`No se pudo resolver el edificio ${item.row.edificio} para crear el aula ${item.row.aula}.`);
                        return;
                    }
                    if (state.classrooms.has(classroomKey)) return;
                    try {
                        await this.createClassroom(item.row, buildingId);
                        state.classrooms.set(classroomKey, 1);
                        createdCounts.classrooms += 1;
                    } catch (error) {
                        if (!this.isDuplicateCatalogError(error)) {
                            failures.push(getGraphQLErrorMessage(error, `No se pudo crear el aula ${item.row.aula} en ${item.row.edificio}.`));
                        }
                    }
                }));

                const subgroupsTask = Promise.all(missingSubgroups.map(async (item) => {
                    if (!item.row.subgroup) return;
                    const parentKey = this.buildCatalogKey(item.row.grupo);
                    const subgroupKey = this.buildSubgroupKey(item.row.grupo, item.row.subgroup);
                    const parentId = state.groups.get(parentKey);
                    if (!parentId) {
                        failures.push(`No se pudo resolver el grupo padre ${item.row.grupo} para crear el subgrupo ${item.row.subgroup}.`);
                        return;
                    }
                    if (state.subgroups.has(subgroupKey)) return;
                    try {
                        const subId = await this.createGroup(item.row.subgroup, parentId, null);
                        state.subgroups.set(subgroupKey, subId);
                        createdCounts.subgroups += 1;
                    } catch (error) {
                        if (this.isDuplicateCatalogError(error)) {
                            const resolved = await this.findGroupIdByName(item.row.subgroup, parentId);
                            if (resolved !== null) state.subgroups.set(subgroupKey, resolved);
                            else failures.push(`No se pudo resolver el subgrupo ${item.row.subgroup} después de detectar un duplicado.`);
                        } else {
                            failures.push(getGraphQLErrorMessage(error, `No se pudo crear el subgrupo ${item.row.subgroup}.`));
                        }
                    }
                }));

                await Promise.all([classroomsTask, subgroupsTask]);

                const iterationCreated = createdCounts.subjects > 0
                    || createdCounts.teachers > 0
                    || createdCounts.buildings > 0
                    || createdCounts.classrooms > 0
                    || createdCounts.groups > 0
                    || createdCounts.subgroups > 0;

                overallCreatedCounts.subjects += createdCounts.subjects;
                overallCreatedCounts.teachers += createdCounts.teachers;
                overallCreatedCounts.buildings += createdCounts.buildings;
                overallCreatedCounts.classrooms += createdCounts.classrooms;
                overallCreatedCounts.groups += createdCounts.groups;
                overallCreatedCounts.subgroups += createdCounts.subgroups;
                overallFailures.push(...failures);
                progressMade = progressMade || iterationCreated;

                this.pruneMissingByCreated(state);

                if (!this.hasMissingCatalogItems()) {
                    break;
                }

                if (!iterationCreated && failures.length === 0) {
                    break;
                }
            }

            // Single re-preview after the loop so collision warnings and other
            // backend-only signals reflect reality before the user confirms.
            await this.PreviewUpload(false);

            this.refreshMissingCatalogItems();

            const createdSummary = this.buildCreatedSummary(overallCreatedCounts);
            const hasCreatedItems = overallCreatedCounts.subjects > 0
                || overallCreatedCounts.teachers > 0
                || overallCreatedCounts.buildings > 0
                || overallCreatedCounts.classrooms > 0
                || overallCreatedCounts.groups > 0
                || overallCreatedCounts.subgroups > 0;

            if (overallFailures.length > 0) {
                const creationSummary = hasCreatedItems
                    ? `Se actualizó ${createdSummary}`
                    : 'No se pudieron crear los catálogos faltantes';
                this.notifications.warning(
                    `${creationSummary}, pero quedaron ${overallFailures.length} incidencia(s) al crear catálogos. ${overallFailures.slice(0, 3).join(' ')}`,
                    'Catálogos parcialmente actualizados'
                );
            } else if (hasCreatedItems) {
                const remainingErrors = this.previewResult?.details.errors?.length ?? 0;
                if (this.hasMissingCatalogItems()) {
                    this.notifications.warning(
                        `Se actualizó ${createdSummary}, pero todavía faltan ${this.buildMissingCatalogSummary()}.`,
                        'Catálogos parcialmente actualizados'
                    );
                } else if (remainingErrors > 0) {
                    this.notifications.success(
                        `Se actualizó ${createdSummary}. Aún quedan ${remainingErrors} error(es) en el archivo por corregir.`,
                        'Catálogos actualizados'
                    );
                } else {
                    this.notifications.success(
                        `Se actualizó ${createdSummary} y el archivo quedó listo para confirmar.`,
                        'Catálogos actualizados'
                    );
                }
            } else if (!progressMade) {
                this.notifications.info(
                    'Los catálogos que faltaban ya existían. Se reanalizó el archivo con la información actualizada.',
                    'Sin cambios'
                );
            }
        } catch (error) {
            this.notifications.danger(
                getGraphQLErrorMessage(error, 'No se pudieron crear los catálogos faltantes.'),
                'Error en catálogos'
            );
        } finally {
            this.isCreatingMissingCatalogs = false;
        }
    }

    // Removes from the missing-* arrays any item whose key is now present in
    // the freshly-mutated catalog state. Lets the popover loop progress without
    // having to round-trip a full file re-preview after every iteration.
    private pruneMissingByCreated(state: ExistingCatalogState): void {
        this.missingSubjects = this.missingSubjects.filter(i => !state.subjects.has(i.key));
        this.missingTeachers = this.missingTeachers.filter(i => !state.teachers.has(i.key));
        this.missingBuildings = this.missingBuildings.filter(i => !state.buildings.has(i.key));
        this.missingClassrooms = this.missingClassrooms.filter(i => !state.classrooms.has(i.key));
        this.missingGroups = this.missingGroups.filter(i => !state.groups.has(i.key));
        this.missingSubgroups = this.missingSubgroups.filter(i => !state.subgroups.has(i.key));
    }

    private refreshMissingCatalogItems(): void {
        const missingItems = this.extractMissingCatalogItems(this.previewRows);
        this.missingSubjects = missingItems.subjects;
        this.missingTeachers = missingItems.teachers;
        this.missingBuildings = missingItems.buildings;
        this.missingClassrooms = missingItems.classrooms;
        this.missingGroups = missingItems.groups;
        this.missingSubgroups = missingItems.subgroups;
    }

    private extractMissingCatalogItems(rows: UploadPreviewRow[]): {
        subjects: MissingCatalogItem[];
        teachers: MissingCatalogItem[];
        buildings: MissingCatalogItem[];
        classrooms: MissingCatalogItem[];
        groups: MissingCatalogItem[];
        subgroups: MissingCatalogItem[];
    } {
        const subjects = new Map<string, MissingCatalogItem>();
        const teachers = new Map<string, MissingCatalogItem>();
        const buildings = new Map<string, MissingCatalogItem>();
        const classrooms = new Map<string, MissingCatalogItem>();
        const groups = new Map<string, MissingCatalogItem>();
        const subgroups = new Map<string, MissingCatalogItem>();

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
                    continue;
                }

                const subgroupMatch = error.match(/^Subgrupo no encontrado:\s*(.+?)\s+en\s+(.+)$/i);
                if (subgroupMatch) {
                    this.registerMissingCatalogItem(subgroups, {
                        type: 'subgroup',
                        key: this.buildSubgroupKey(subgroupMatch[2], subgroupMatch[1]),
                        row,
                        rowNumbers: [row.rowNumber],
                    });
                    continue;
                }

                const groupMatch = error.match(/^Grupo no encontrado:\s*(.+)$/i);
                if (groupMatch) {
                    this.registerMissingCatalogItem(groups, {
                        type: 'group',
                        key: this.buildCatalogKey(groupMatch[1]),
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
            groups: [...groups.values()],
            subgroups: [...subgroups.values()],
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
        const [subjectsResponse, teachersResponse, buildingsResponse, classroomsResponse, groupsResponse] = await Promise.all([
            firstValueFrom(this.apollo.query<any>({ query: GET_SUBJECTS, fetchPolicy: 'network-only' })),
            firstValueFrom(this.apollo.query<any>({ query: GET_TEACHERS, fetchPolicy: 'network-only' })),
            firstValueFrom(this.apollo.query<any>({ query: GET_BUILDINGS, fetchPolicy: 'network-only' })),
            firstValueFrom(this.apollo.query<any>({ query: GET_CLASSROOMS, fetchPolicy: 'network-only' })),
            firstValueFrom(this.apollo.query<any>({ query: GET_GROUPS, fetchPolicy: 'network-only' })),
        ]);

        const allGroups: any[] = groupsResponse?.data?.GetGroups ?? [];
        const rootGroups = new Map<string, number>();
        const subgroups = new Map<string, number>();
        for (const group of allGroups) {
            if (group.parent) {
                subgroups.set(this.buildSubgroupKey(group.parent.name, group.name), Number(group.id));
            } else {
                rootGroups.set(this.buildCatalogKey(group.name), Number(group.id));
            }
        }

        return {
            subjects: new Map((subjectsResponse?.data?.GetSubjects ?? []).map((subject: any) => [this.buildCatalogKey(subject.code), Number(subject.id)])),
            teachers: new Map((teachersResponse?.data?.GetTeachers ?? []).map((teacher: any) => [this.buildCatalogKey(teacher.employeeNumber), Number(teacher.id)])),
            buildings: new Map((buildingsResponse?.data?.GetBuildings ?? []).map((building: any) => [this.buildCatalogKey(building.name), Number(building.id)])),
            classrooms: new Map((classroomsResponse?.data?.GetClassrooms ?? []).map((classroom: any) => [this.buildClassroomKey(classroom.building?.name, classroom.name), Number(classroom.id)])),
            groups: rootGroups,
            subgroups,
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

    private async createGroup(name: string, parentId: number | null, grade: number | null): Promise<number> {
        const response = await firstValueFrom(this.apollo.mutate<any>({
            mutation: CREATE_GROUP,
            variables: {
                input: {
                    name,
                    parentId,
                    grade: parentId !== null ? null : grade,
                },
            },
        }));
        const createdId = Number(response?.data?.CreateGroup?.id ?? 0);
        if (createdId > 0) {
            return createdId;
        }
        throw new Error('No se pudo obtener el identificador del grupo creado.');
    }

    private async findGroupIdByName(name: string, parentId: number | null): Promise<number | null> {
        const response = await firstValueFrom(this.apollo.query<any>({
            query: GET_GROUPS,
            fetchPolicy: 'network-only',
        }));
        const target = (response?.data?.GetGroups ?? []).find((g: any) => {
            const sameName = this.buildCatalogKey(g.name) === this.buildCatalogKey(name);
            const sameParent = parentId === null ? !g.parent : Number(g.parent?.id ?? 0) === parentId;
            return sameName && sameParent;
        });
        if (!target) return null;
        const id = Number(target.id);
        return Number.isFinite(id) && id > 0 ? id : null;
    }

    private buildMissingCatalogSummary(): string {
        const parts: string[] = [];

        if (this.missingGroups.length > 0) {
            parts.push(this.buildCountLabel(this.missingGroups.length, 'grupo'));
        }

        if (this.missingSubgroups.length > 0) {
            parts.push(this.buildCountLabel(this.missingSubgroups.length, 'subgrupo'));
        }

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

    private buildCreatedSummary(counts: { subjects: number; teachers: number; buildings: number; classrooms: number; groups: number; subgroups: number; }): string {
        const parts: string[] = [];

        if (counts.groups > 0) {
            parts.push(this.buildCountLabel(counts.groups, 'grupo'));
        }

        if (counts.subgroups > 0) {
            parts.push(this.buildCountLabel(counts.subgroups, 'subgrupo'));
        }

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

    private buildSubgroupKey(parentName: string | null | undefined, subgroupName: string): string {
        return `${this.buildCatalogKey(parentName ?? '')}::${this.buildCatalogKey(subgroupName)}`;
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

        this.http.post(`${this.apiUrl}/api/academic/upload-schedule`, formData)
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

                        this.notifications.warning(message, title);
                    } else {
                        this.notifications.success(`Se procesaron ${processed} registros correctamente.`, 'Carga exitosa');
                    }
                    this.clearSelection();
                },
                error: (err) => {
                    this.isConfirmLoading = false;
                    this.notifications.danger('Error en la carga: ' + (err.error?.message || err.message), 'Error en la carga');
                }
            });
    }
}
