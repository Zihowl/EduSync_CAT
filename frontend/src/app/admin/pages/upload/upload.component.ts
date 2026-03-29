import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonCard,
  IonCardContent,
  IonButton,
  IonIcon,
  IonProgressBar,
  IonText
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
        IonHeader,
        IonToolbar,
        IonTitle,
        IonButtons,
        IonBackButton,
        IonCard,
        IonCardContent,
        IonButton,
        IonIcon,
        IonProgressBar,
        IonText
    ],
    template: `
        <ion-header>
            <ion-toolbar color="primary">
                <ion-buttons slot="start">
                    <ion-back-button defaultHref="/admin"></ion-back-button>
                </ion-buttons>
                <ion-title>Carga de Horarios</ion-title>
            </ion-toolbar>
        </ion-header>

        <ion-content class="ion-padding">
            <div class="container upload-container">
                <ion-card class="text-center p-4">
                    <ion-icon name="cloud-upload-outline" class="upload-icon" color="primary"></ion-icon>
                    <h2>Subir Archivo Excel</h2>
                    <p class="text-muted">
                        El archivo debe contener las columnas: <br>
                        <strong>ClaveMateria, Materia, NoEmpleado, Docente, Grupo, Aula, Dia, HoraInicio, HoraFin</strong>
                    </p>

                    <input
                        type="file"
                        #fileInput
                        (change)="OnFileSelected($event)"
                        accept=".xlsx, .xls"
                        class="upload-file-input">

                    <div *ngIf="!selectedFile" class="mt-3">
                        <ion-button (click)="fileInput.click()">
                            Seleccionar Archivo
                        </ion-button>
                    </div>

                    <div *ngIf="selectedFile" class="mt-3">
                        <p class="fw-bold">
                            <ion-icon name="document-text-outline"></ion-icon>
                            {{ selectedFile.name }}
                        </p>

                        <ion-button color="success" (click)="Upload()" [disabled]="isLoading">
                            {{ isLoading ? 'Procesando...' : 'Confirmar Carga' }}
                        </ion-button>
                        <ion-button fill="clear" color="danger" (click)="selectedFile = null" [disabled]="isLoading">
                            Cancelar
                        </ion-button>
                    </div>

                    <ion-progress-bar *ngIf="isLoading" type="indeterminate" class="mt-3"></ion-progress-bar>

                    <div *ngIf="uploadResult" class="mt-4 text-start">
                        <div class="alert alert-success" *ngIf="uploadResult.processed > 0">
                            ✅ Se procesaron {{ uploadResult.processed }} registros correctamente.
                        </div>

                        <div class="alert alert-warning" *ngIf="uploadResult.errors.length > 0">
                            ⚠️ Hubo errores en algunas filas:
                            <ul class="mb-0">
                                <li *ngFor="let err of uploadResult.errors">{{ err }}</li>
                            </ul>
                        </div>
                    </div>
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

    selectedFile: File | null = null;
    isLoading = false;
    uploadResult: any = null;

    ngOnInit() 
    {
        addIcons({ cloudUploadOutline, documentTextOutline });
    }

    OnFileSelected(event: any) 
    {
        this.selectedFile = event.target.files[0];
        this.uploadResult = null;
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
                    this.selectedFile = null;
                },
            error: (err) =>
            {
                    this.isLoading = false;
                    alert('Error en la carga: ' + (err.error?.message || err.message));
                }
            });
    }
}
