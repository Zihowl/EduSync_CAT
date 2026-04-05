import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import {
    IonContent,
  IonCard,
  IonCardContent,
  IonButton,
  IonIcon,
  IonProgressBar,
  IonAlert
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
        IonAlert,
        PageHeaderComponent
    ],
    template: `
        <app-page-header title="Carga de Horarios" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding upload-content">
            <div class="upload-container app-page-shell">
                <ion-card class="upload-card">
                    <ion-card-content>
                        <div class="upload-header">
                            <ion-icon name="cloud-upload-outline" class="upload-icon" color="primary"></ion-icon>
                            <h2>Subir Archivo Excel</h2>
                            <p class="text-muted">
                                El archivo debe contener las columnas: <br>
                                <strong>ClaveMateria, Materia, NoEmpleado (opcional), Docente (opcional), Grupo, Subgrupo (opcional), Aula, Edificio, Dia, HoraInicio, HoraFin</strong>
                            </p>
                        </div>

                        <input
                            type="file"
                            #fileInput
                            (change)="OnFileSelected($event)"
                            accept=".xlsx, .csv"
                            class="upload-file-input">

                        <div *ngIf="!selectedFile" class="button-area">
                            <ion-button expand="block" (click)="fileInput.click()">
                                Seleccionar Archivo
                            </ion-button>
                        </div>

                        <div *ngIf="selectedFile" class="selected-file">
                            <p class="file-name">
                                <ion-icon name="document-text-outline"></ion-icon>
                                {{ selectedFile.name }}
                            </p>

                            <div class="button-group">
                                <ion-button expand="block" color="success" (click)="Upload()" [disabled]="isLoading">
                                    {{ isLoading ? 'Procesando...' : 'Confirmar Carga' }}
                                </ion-button>
                                <ion-button expand="block" fill="clear" color="danger" (click)="clearSelection(fileInput)" [disabled]="isLoading">
                                    Cancelar
                                </ion-button>
                            </div>
                        </div>

                        <ion-progress-bar *ngIf="isLoading" type="indeterminate" class="upload-progress"></ion-progress-bar>

                        <ion-alert
                            [isOpen]="!!uploadResult?.success && uploadResult.processed > 0"
                            header="Carga Exitosa"
                            [message]="'Se procesaron ' + uploadResult?.processed + ' registros correctamente.'"
                            [buttons]="['OK']"
                            (didDismiss)="uploadResult = null">
                        </ion-alert>

                        <ion-alert
                            *ngIf="uploadResult && uploadResult.errors.length > 0"
                            [isOpen]="!!uploadResult && uploadResult.errors.length > 0"
                            header="Errores en la Carga"
                            [subHeader]="'Se procesaron ' + uploadResult.processed + ' registros, pero hubo errores en algunas filas (total: ' + uploadResult.errors.length + ')'"
                            [message]="uploadResult.errors.slice(0, 5).join(' | ')"
                            [buttons]="['OK']"
                            (didDismiss)="uploadResult = null">
                        </ion-alert>
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
    private apiUrl = environment.apiUrl;
    private fileInputElement: HTMLInputElement | null = null;

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
                    this.clearSelection();
                },
            error: (err) =>
            {
                    this.isLoading = false;
                    alert('Error en la carga: ' + (err.error?.message || err.message));
                }
            });
    }
}
