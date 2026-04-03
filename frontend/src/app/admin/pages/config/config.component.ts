import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, NgForOf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { IonContent, IonList, IonItem, IonLabel, IonInput, IonButton, IonIcon, IonCard, IonCardContent } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, calendarOutline, checkmarkOutline, globeOutline, informationCircleOutline, trashOutline } from 'ionicons/icons';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

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
        NgForOf,
        FormsModule,
        IonContent,
        IonList,
        IonItem,
        IonLabel,
        IonInput,
        IonButton,
        IonIcon,
        IonCard,
        IonCardContent,
        PageHeaderComponent
    ],
    template: `
        <app-page-header title="Configuración Global" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding config-content">
            <div class="config-wrapper">
                <div class="config-container">
                    <!-- SECCIÓN CICLO ESCOLAR -->
                    <div class="config-section">
                        <div class="section-header">
                            <ion-icon name="calendar-outline"></ion-icon>
                            <h2>Ciclo Escolar</h2>
                        </div>
                        
                        <ion-card>
                            <p class="panel-subtitle">Configurar ciclo</p>
                            <ion-card-content>
                                <form class="form-section">
                                    <div class="form-row">
                                        <div class="form-group">
                                            <ion-input
                                                label="Fecha de inicio"
                                                label-placement="stacked"
                                                fill="outline"
                                                type="date"
                                                [(ngModel)]="newSchoolYearStart"
                                                name="startDate">
                                            </ion-input>
                                        </div>
                                        <div class="form-group">
                                            <ion-input
                                                label="Fecha de cierre"
                                                label-placement="stacked"
                                                fill="outline"
                                                type="date"
                                                [(ngModel)]="newSchoolYearEnd"
                                                name="endDate">
                                            </ion-input>
                                        </div>
                                    </div>
                                    <ion-button 
                                        expand="block"
                                        color="primary"
                                        (click)="AddSchoolYear()" 
                                        [disabled]="!newSchoolYearStart || !newSchoolYearEnd"
                                        class="form-submit">
                                        <ion-icon name="checkmark-outline" slot="start"></ion-icon>
                                        Guardar Ciclo
                                    </ion-button>
                                </form>
                            </ion-card-content>
                        </ion-card>

                        <ion-card class="info-card">
                            <p class="info-card-title">Ciclo actual</p>
                            <ion-card-content>
                                <div *ngIf="currentSchoolYear; else noCycle" class="current-cycle">
                                    <div class="cycle-range">
                                        <ion-icon name="calendar-outline"></ion-icon>
                                        {{ currentSchoolYear.startDate | date:'dd/MM/yyyy' }} 
                                        <span class="arrow">→</span> 
                                        {{ currentSchoolYear.endDate | date:'dd/MM/yyyy' }}
                                    </div>
                                    <small class="cycle-saved">
                                        Configurado: {{ currentSchoolYear.createdAt | date:'short' }}
                                    </small>
                                </div>
                                <ng-template #noCycle>
                                    <div class="no-data">
                                        <ion-icon name="alert-circle-outline"></ion-icon>
                                        <p>No hay ciclo configurado</p>
                                    </div>
                                </ng-template>
                            </ion-card-content>
                        </ion-card>
                    </div>

                    <!-- SECCIÓN DOMINIOS PERMITIDOS -->
                    <div class="config-section">
                        <div class="section-header">
                            <ion-icon name="globe-outline"></ion-icon>
                            <h2>Dominios Permitidos</h2>
                        </div>

                        <ion-card>
                            <p class="panel-subtitle">Agregar dominio</p>
                            <ion-card-content>
                                <div class="domain-input-section">
                                    <ion-input
                                        label="Dominio"
                                        label-placement="stacked"
                                        fill="outline"
                                        type="text"
                                        [(ngModel)]="newDomain"
                                        placeholder="ej: institución.edu.mx"
                                        (keyup.enter)="AddDomain()">
                                    </ion-input>
                                    <ion-button 
                                        color="success"
                                        (click)="AddDomain()" 
                                        [disabled]="!newDomain"
                                        class="add-domain-btn">
                                        Agregar
                                    </ion-button>
                                </div>
                            </ion-card-content>
                        </ion-card>

                        <ion-card class="domains-list-card" *ngIf="domains.length > 0">
                            <p class="domains-list-title">Dominios registrados ({{ domains.length }})</p>
                            <ion-list class="domains-list">
                                <ion-item *ngFor="let d of domains" class="domain-item">
                                    <ion-label class="domain-name">{{ d.domain }}</ion-label>
                                    <ion-button 
                                        fill="clear" 
                                        color="danger" 
                                        slot="end" 
                                        (click)="RemoveDomain(d.id)"
                                        class="delete-btn">
                                        <ion-icon name="trash-outline"></ion-icon>
                                    </ion-button>
                                </ion-item>
                            </ion-list>
                        </ion-card>

                        <ion-card class="empty-state-card" *ngIf="domains.length === 0">
                            <ion-card-content>
                                <div class="no-data">
                                    <ion-icon name="information-circle-outline"></ion-icon>
                                    <p>Sin dominios registrados</p>
                                    <small>Agrega dominios arriba para permitir usuarios</small>
                                </div>
                            </ion-card-content>
                        </ion-card>
                    </div>
                </div>
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
            addIcons({
                trashOutline,
                calendarOutline,
                checkmarkOutline,
                globeOutline,
                alertCircleOutline,
                informationCircleOutline
            });
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
