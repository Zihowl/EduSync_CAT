import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonList, IonItem, IonLabel, IonInput, IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trashOutline } from 'ionicons/icons';

const GET_DOMAINS = gql`
    query GetAllowedDomains {
        GetAllowedDomains {
            id
            domain
        }
    }
`;

const ADD_DOMAIN = gql`
    mutation CreateAllowedDomain($domain: String!) {
        CreateAllowedDomain(domain: $domain) {
            id
            domain
        }
    }
`;

const REMOVE_DOMAIN = gql`
    mutation RemoveAllowedDomain($id: Int!) {
        RemoveAllowedDomain(id: $id)
    }
`;

const GET_CURRENT_SCHOOL_YEAR = gql`
    query GetCurrentSchoolYear {
        GetCurrentSchoolYear {
            id
            startDate
            endDate
            createdAt
        }
    }
`;

const SET_CURRENT_SCHOOL_YEAR = gql`
    mutation SetCurrentSchoolYear($startDate: String!, $endDate: String!) {
        SetCurrentSchoolYear(startDate: $startDate, endDate: $endDate) {
            id
            startDate
            endDate
        }
    }
`;

@Component({
    selector: 'app-config',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        IonContent,
        IonHeader,
        IonToolbar,
        IonTitle,
        IonButtons,
        IonBackButton,
        IonList,
        IonItem,
        IonLabel,
        IonInput,
        IonButton,
        IonIcon
    ],
    template: `
        <ion-header>
            <ion-toolbar color="primary">
                <ion-buttons slot="start">
                    <ion-back-button defaultHref="/admin"></ion-back-button>
                </ion-buttons>
                <ion-title>Configuración Global</ion-title>
            </ion-toolbar>
        </ion-header>

        <ion-content class="ion-padding">
            <div class="container config-container">

                <h3>Ciclo Escolar</h3>
                <form class="card mb-4 bg-dark text-white border-secondary">
                    <div class="card-body d-flex gap-2 justify-content-between align-items-center border-opacity-0 flex-wrap">
                        <div class="d-flex gap-2 align-items-center  flex-column col-lg-4 col-12 flex-grow-1">
                            <label class="mb-0 text-white">Fecha inicio</label>
                            <input type="date" class="form-control bg-dark text-white" [(ngModel)]="newSchoolYearStart" name="startDate">
                        </div>
                        <div class="d-flex gap-2 align-items-center  flex-column col-lg-4 col-12 flex-grow-1">
                            <label class="mb-0 text-white">Fecha de cierre</label>
                            <input type="date" class="form-control bg-dark text-white" [(ngModel)]="newSchoolYearEnd" name="endDate">
                        </div>
                        <div class="col-lg-2 col-12">
                            <button class="btn btn-primary w-100" (click)="AddSchoolYear()" [disabled]="!newSchoolYearStart || !newSchoolYearEnd">
                                Guardar
                            </button>
                        </div>
                    </div>
                </form>

                <div class="card mb-4 bg-dark text-white border-secondary">
                    <div class="card-body">
                        <h5 class="mb-2">Ciclo en curso</h5>
                        <div *ngIf="currentSchoolYear; else noCycle" class="current-cycle">
                            <div class="cycle-range fw-bold fs-5 text-white">
                                {{ currentSchoolYear.startDate | date:'dd-MM-yyyy' }} → {{ currentSchoolYear.endDate | date:'dd-MM-yyyy' }}
                            </div>
                            <small class="cycle-saved text-white-50">Guardado: {{ currentSchoolYear.createdAt | date:'short' }}</small>
                        </div>
                        <ng-template #noCycle>
                            <div class="text-muted">No hay ciclo en curso.</div>
                        </ng-template>
                    </div>
                </div> 

                <br>
                <h3>Dominios Permitidos</h3>
                <div class="card mb-4 bg-dark text-white border-secondary">
                    <div class="card-body d-flex gap-2">
                        <input
                            type="text"
                            class="form-control bg-dark text-white border-secondary"
                            [(ngModel)]="newDomain"
                            placeholder="ej: ceti.mx"
                            (keyup.enter)="AddDomain()">
                        <button class="btn btn-primary" (click)="AddDomain()" [disabled]="!newDomain">
                            Agregar
                        </button>
                    </div>
                </div>

                <hr class="" style="margin: 1.1rem 0 1.3rem;">
            
                <ion-list>
                    <ion-item *ngFor="let d of domains">
                        <ion-label>{{ d.domain }}</ion-label>
                        <ion-button fill="clear" color="danger" slot="end" (click)="RemoveDomain(d.id)">
                            <ion-icon name="trash-outline"></ion-icon>
                        </ion-button>
                    </ion-item>
                    <div *ngIf="domains.length === 0" class="text-center p-3 text-muted">
                        No hay dominios registrados.
                    </div>
                </ion-list>
            </div>
        </ion-content>
    `,
    styleUrls: ['./config.component.scss']
})
export class ConfigComponent implements OnInit
{
    private apollo = inject(Apollo);

    domains: any[] = [];
    currentSchoolYear: any = null;
    newDomain: string = '';
    newSchoolYearStart: string = '';
    newSchoolYearEnd: string = '';

    ngOnInit() 
    {
      addIcons({ trashOutline });
        this.LoadDomains();
        this.LoadCurrentSchoolYear();
    }

    LoadDomains() 
    {
        this.apollo.watchQuery<any>({ query: GET_DOMAINS })
            .valueChanges.subscribe({
                next: (res: any) => {
                    const data = res?.data;
                    if (!data)
                    {
                        console.error('GetAllowedDomains returned no data:', res);
                        this.domains = [];
                        return;
                    }

                    this.domains = data.GetAllowedDomains ?? [];
                },
                error: (err) => {
                    console.error('GetAllowedDomains network/error:', err);
                    this.domains = [];
                }
            });
    }

    LoadCurrentSchoolYear()
    {
        this.apollo.query<any>({ query: GET_CURRENT_SCHOOL_YEAR, fetchPolicy: 'network-only' })
            .subscribe({
                next: (res: any) => {
                    const data = res?.data;
                    const errors = res?.errors;
                    if (errors && errors.length > 0) {
                        console.error('GetCurrentSchoolYear errors:', errors);
                    }
                    console.debug('GetCurrentSchoolYear result:', data);
                    this.currentSchoolYear = data?.GetCurrentSchoolYear ?? null;
                },
                error: (err) => {
                    console.error('GetCurrentSchoolYear network/error:', err);
                    this.currentSchoolYear = null;
                }
            });
    }

    AddDomain() 
    {
      if (!this.newDomain)
      {
        return;
      }
        
        this.apollo.mutate({
            mutation: ADD_DOMAIN,
            variables: { domain: this.newDomain },
            refetchQueries: [{ query: GET_DOMAINS }]
        }).subscribe({
        next: () =>
        {
                this.newDomain = '';
            },
            error: (err) => alert('Error al agregar dominio: ' + err.message)
        });
    }

    AddSchoolYear()
    {
        if (!this.newSchoolYearStart || !this.newSchoolYearEnd)
        {
            return;
        }

        this.apollo.mutate({
            mutation: SET_CURRENT_SCHOOL_YEAR,
            variables: { startDate: this.newSchoolYearStart, endDate: this.newSchoolYearEnd },
            refetchQueries: [{ query: GET_CURRENT_SCHOOL_YEAR }]
        }).subscribe({
            next: (res: any) => {
                console.debug('SetCurrentSchoolYear response:', res);
                alert('Ciclo en curso actualizado: ' + this.newSchoolYearStart + ' - ' + this.newSchoolYearEnd);
                this.newSchoolYearStart = '';
                this.newSchoolYearEnd = '';
                // Force reload in case refetchQueries didn't run with auth headers yet
                this.LoadCurrentSchoolYear();
            },
            error: (err) => alert('Error al guardar ciclo escolar: ' + err.message)
        });
    }

    RemoveDomain(id: number) 
    {
      if (!confirm('¿Eliminar este dominio?'))
      {
        return;
      }

        this.apollo.mutate(
        {
            mutation: REMOVE_DOMAIN,
            variables: { id: parseInt(id.toString()) },
            refetchQueries: [{ query: GET_DOMAINS }]
        }).subscribe();
    }
}
