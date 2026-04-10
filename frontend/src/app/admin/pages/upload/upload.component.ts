import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { NotificationService } from '../../../shared/services/notification.service';
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
        <app-page-header title="Carga de Horarios" subtitle="Analiza el archivo antes de confirmar" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

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
                                    <p class="upload-kicker">Importación masiva</p>
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

                                <div class="upload-note">
                                    Archivo de prueba: <strong>test-data/horarios_prueba.csv</strong>
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
                                            <small *ngIf="row.grade != null">Grado {{ row.grade }}</small>
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
export class UploadComponent implements OnInit
{
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
    previewResult: UploadPreviewResponse | null = null;
    previewRows: UploadPreviewRow[] = [];

    ngOnInit() 
    {
        addIcons({ cloudUploadOutline, documentTextOutline, warningOutline });
    }

    ionViewWillLeave(): void
    {
        this.isPreviewLoading = false;
        this.isConfirmLoading = false;
    }

    OnFileSelected(event: any) 
    {
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
        void this.PreviewUpload();
    }

    clearSelection(input: HTMLInputElement | null = this.fileInputElement)
    {
        this.selectedFile = null;
        this.previewResult = null;
        this.previewRows = [];
        this.isPreviewLoading = false;
        this.isConfirmLoading = false;

        if (input) {
            input.value = '';
        }
    }

    private isAllowedFile(file: File): boolean
    {
        return /\.(xlsx|csv)$/i.test(file.name);
    }

    hasPreview(): boolean
    {
        return this.previewRows.length > 0;
    }

    get validRowCount(): number
    {
        return this.previewRows.filter((row) => row.errors.length === 0).length;
    }

    get errorRowCount(): number
    {
        return this.previewRows.filter((row) => row.errors.length > 0).length;
    }

    canConfirm(): boolean
    {
        return !!this.selectedFile
            && this.hasPreview()
            && !!this.previewResult?.details.success
            && !this.isPreviewLoading
            && !this.isConfirmLoading;
    }

    formatClock(value: string): string
    {
        return value ? value.substring(0, 5) : '';
    }

    trackByRow(index: number, row: UploadPreviewRow): number
    {
        return row.rowNumber;
    }

    PreviewUpload()
    {
        if (!this.selectedFile || this.isPreviewLoading || this.isConfirmLoading) {
            return;
        }

        this.isPreviewLoading = true;
        this.previewResult = null;
        this.previewRows = [];

        const formData = new FormData();
        formData.append('file', this.selectedFile);

        this.http.post<UploadPreviewResponse>(`${this.apiUrl}/academic/upload-schedule/preview`, formData)
            .subscribe({
                next: (res) => {
                    this.isPreviewLoading = false;
                    this.previewResult = res;
                    this.previewRows = res.details.rows ?? [];

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
                },
                error: (err) => {
                    this.isPreviewLoading = false;
                    this.notifications.danger('Error en la previsualización: ' + (err.error?.message || err.message), 'Error en la previsualización', { autoDismissMs: 0 });
                }
            });
    }

    Upload() 
    {
      if (!this.canConfirm())
      {
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
            next: (res: any) =>
            {
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
            error: (err) =>
            {
                    this.isConfirmLoading = false;
                    this.notifications.danger('Error en la carga: ' + (err.error?.message || err.message), 'Error en la carga', { autoDismissMs: 0 });
                }
            });
    }
}
