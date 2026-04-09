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
    IonProgressBar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cloudUploadOutline, documentTextOutline } from 'ionicons/icons';
import { environment } from '../../../../environments/environment';

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
        PageHeaderComponent
    ],
    template: `
        <app-page-header title="Carga de Horarios" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding upload-content">
            <div class="upload-shell app-page-shell app-page-shell--wide">
                <div class="upload-grid">
                    <ion-card class="upload-card upload-card--hero">
                        <ion-card-content>
                            <div class="upload-hero">
                                <div class="upload-hero__icon">
                                    <ion-icon name="cloud-upload-outline" class="upload-icon"></ion-icon>
                                </div>

                                <div class="upload-hero__copy">
                                    <p class="upload-kicker">Importación masiva</p>
                                    <h2>Sube horarios desde Excel o CSV</h2>
                                    <p class="upload-description">
                                        Usa el archivo de prueba para poblar catálogos reales de una universidad:
                                        docentes, materias, grupos, edificios, aulas y bloques horarios.
                                    </p>
                                </div>
                            </div>

                            <div class="upload-badges">
                                <span class="upload-badge">.xlsx</span>
                                <span class="upload-badge">.csv</span>
                                <span class="upload-badge">Catálogos automáticos</span>
                                <span class="upload-badge">Validación por columna</span>
                            </div>

                            <div class="upload-action-panel">
                                <input
                                    type="file"
                                    #fileInput
                                    (change)="OnFileSelected($event)"
                                    accept=".xlsx, .csv"
                                    class="upload-file-input">

                                <div *ngIf="!selectedFile" class="button-area">
                                    <ion-button expand="block" (click)="fileInput.click()">
                                        Seleccionar archivo
                                    </ion-button>
                                </div>

                                <div *ngIf="selectedFile" class="selected-file">
                                    <p class="file-name">
                                        <ion-icon name="document-text-outline"></ion-icon>
                                        {{ selectedFile.name }}
                                    </p>

                                    <p class="file-meta">
                                        Revisa que las columnas coincidan antes de confirmar la carga.
                                    </p>

                                    <div class="button-group">
                                        <ion-button expand="block" color="success" (click)="Upload()" [disabled]="isLoading">
                                            {{ isLoading ? 'Procesando...' : 'Confirmar carga' }}
                                        </ion-button>
                                        <ion-button expand="block" fill="outline" color="medium" (click)="clearSelection(fileInput)" [disabled]="isLoading">
                                            Cambiar archivo
                                        </ion-button>
                                    </div>
                                </div>

                                <ion-progress-bar *ngIf="isLoading" type="indeterminate" class="upload-progress"></ion-progress-bar>
                            </div>
                        </ion-card-content>
                    </ion-card>

                    <ion-card class="upload-card upload-card--guide">
                        <ion-card-content>
                            <div class="upload-guide">
                                <div>
                                    <p class="upload-kicker">Formato esperado</p>
                                    <h3 class="upload-guide__title">Columnas del archivo</h3>
                                    <p class="upload-guide__text">
                                        La importación busca cada encabezado por nombre exacto. Aula, Edificio, Día, Hora Inicio y Hora Fin son obligatorios.
                                        NoEmpleado, Docente y Subgrupo pueden ir vacíos.
                                    </p>
                                </div>

                                <div class="upload-column-grid">
                                    <div *ngFor="let column of expectedColumns" class="upload-column" [class.upload-column--required]="column.required">
                                        <span class="upload-column__label">{{ column.label }}</span>
                                        <span class="upload-column__state">{{ column.required ? 'Requerido' : 'Opcional' }}</span>
                                    </div>
                                </div>

                                <div class="upload-note">
                                    Archivo de prueba: <strong>test-data/horarios_prueba.csv</strong>
                                </div>
                            </div>
                        </ion-card-content>
                    </ion-card>
                </div>
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
        { label: 'NoEmpleado', required: false },
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
    isLoading = false;
    uploadResult: any = null;

    ngOnInit() 
    {
        addIcons({ cloudUploadOutline, documentTextOutline });
    }

    OnFileSelected(event: any) 
    {
        this.fileInputElement = event.target as HTMLInputElement;
        this.selectedFile = this.fileInputElement.files?.[0] ?? null;
        this.uploadResult = null;
    }

    clearSelection(input: HTMLInputElement | null = this.fileInputElement)
    {
        this.selectedFile = null;
        this.uploadResult = null;

        if (input) {
            input.value = '';
        }
    }

    Upload() 
    {
      if (!this.selectedFile)
      {
        return;
      }

        this.isLoading = true;
        const formData = new FormData();
        formData.append('file', this.selectedFile);

        this.http.post(`${this.apiUrl}/academic/upload-schedule`, formData)
            .subscribe({
            next: (res: any) =>
            {
                    this.isLoading = false;
                    this.uploadResult = res.details;
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
                    this.isLoading = false;
                    this.notifications.danger('Error en la carga: ' + (err.error?.message || err.message), 'Error en la carga', { autoDismissMs: 0 });
                }
            });
    }
}
