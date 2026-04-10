import { Component, OnInit, ChangeDetectorRef, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { IonContent, IonItem, IonLabel, IonInput, IonButton, IonIcon, IonCard, IonCardContent, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, calendarOutline, checkmarkOutline, globeOutline, informationCircleOutline, trashOutline } from 'ionicons/icons';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataListComponent } from '../../../shared/components/data-list/data-list.component';
import { NotificationService } from '../../../shared/services/notification.service';
import { DestroyRef } from '@angular/core';
import { RealtimeScope, RealtimeSyncService } from '../../../core/services/realtime-sync.service';
import { RealtimeQueryCacheService } from '../../../core/services/realtime-query-cache.service';

const GET_DOMAINS = gql`
    query GetAllowedDomains {
        GetAllowedDomains {
            id
            domain
            hasActiveUsers
        }
    }
`;

const ADD_DOMAIN = gql`
    mutation CreateAllowedDomain($domain: String!) {
        CreateAllowedDomain(domain: $domain) {
            id
            domain
            hasActiveUsers
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
            createdAt
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
        IonItem,
        IonLabel,
        IonInput,
        IonButton,
        IonIcon,
        IonCard,
        IonCardContent,
        IonSpinner,
        PageHeaderComponent,
        DataListComponent
    ],
    template: `
        <app-page-header title="Configuración Global" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding config-content">
            <div class="config-wrapper app-page-shell">
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
                                                (ionInput)="newSchoolYearStart = $any($event).detail.value ?? ''"
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
                                                (ionInput)="newSchoolYearEnd = $any($event).detail.value ?? ''"
                                                name="endDate">
                                            </ion-input>
                                        </div>
                                    </div>
                                    <ion-button 
                                        type="button"
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
                                <ng-container *ngIf="isCurrentSchoolYearLoaded; else currentSchoolYearLoading">
                                    <div *ngIf="currentSchoolYear; else noCycle" class="current-cycle">
                                        <div class="cycle-range">
                                            <ion-icon name="calendar-outline"></ion-icon>
                                            {{ currentSchoolYear.startDate | date:'dd/MM/yyyy' }} 
                                            <span class="arrow">→</span> 
                                            {{ currentSchoolYear.endDate | date:'dd/MM/yyyy' }}
                                        </div>
                                        <small class="cycle-saved">
                                            Configurado: {{ formatConfiguredAt(currentSchoolYear.createdAt) }}
                                        </small>
                                    </div>
                                    <ng-template #noCycle>
                                        <div class="no-data">
                                            <ion-icon name="alert-circle-outline"></ion-icon>
                                            <p>No hay ciclo configurado</p>
                                        </div>
                                    </ng-template>
                                </ng-container>

                                <ng-template #currentSchoolYearLoading>
                                    <div class="loading-state">
                                        <ion-spinner name="crescent"></ion-spinner>
                                        <p>Cargando ciclo actual...</p>
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
                                        (ionInput)="newDomain = $any($event).detail.value ?? ''"
                                        placeholder="ej: institución.edu.mx"
                                        (keyup.enter)="AddDomain()">
                                    </ion-input>
                                    <ion-button 
                                        type="button"
                                        color="primary"
                                        (click)="AddDomain()" 
                                        [disabled]="!newDomain"
                                        class="add-domain-btn">
                                        Agregar
                                    </ion-button>
                                </div>
                            </ion-card-content>
                        </ion-card>

                        <app-data-list
                            [items]="domains"
                            [loaded]="isDomainsLoaded"
                            title="Dominios registrados ({count})"
                            loadingText="Cargando dominios..."
                            emptyIcon="information-circle-outline"
                            emptyTitle="Sin dominios registrados"
                            emptySubtitle="Agrega dominios arriba para permitir usuarios"
                            cardClass="domains-list-card">
                            <ng-template #itemTemplate let-d let-i="index">
                                <ion-item class="domain-item" lines="none">
                                    <ion-label class="domain-name">{{ d.domain }}</ion-label>
                                    <ion-button 
                                        type="button"
                                        fill="clear" 
                                        [color]="d.hasActiveUsers ? 'medium' : 'danger'" 
                                        slot="end" 
                                        (click)="RemoveDomain(d.id)"
                                        [disabled]="d.hasActiveUsers"
                                        [title]="d.hasActiveUsers ? 'No se puede eliminar mientras existan usuarios activos asociados' : 'Eliminar dominio'"
                                        class="delete-btn">
                                        <ion-icon name="trash-outline"></ion-icon>
                                    </ion-button>
                                </ion-item>
                            </ng-template>
                        </app-data-list>

                        <div class="domains-section-spacer" aria-hidden="true"></div>
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
    private cdr = inject(ChangeDetectorRef);
    private ngZone = inject(NgZone);
    private destroyRef = inject(DestroyRef);
    private realtimeSync = inject(RealtimeSyncService);
    private queryCache = inject(RealtimeQueryCacheService);
    private notifications = inject(NotificationService);
    private readonly userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    domains: any[] = [];
    currentSchoolYear: any = null;
    newDomain: string = '';
    newSchoolYearStart: string = '';
    newSchoolYearEnd: string = '';
    isDomainsLoaded = false;
    isCurrentSchoolYearLoaded = false;

    private runInZone(action: () => void): void
    {
        this.ngZone.run(action);
    }

    formatConfiguredAt(value: string | Date | null | undefined): string
    {
        if (!value)
        {
            return 'No disponible';
        }

        const date = this.parseConfiguredAtValue(value);

        if (Number.isNaN(date.getTime()))
        {
            return 'No disponible';
        }

        const parts = new Intl.DateTimeFormat('es-MX', {
            timeZone: this.userTimeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        }).formatToParts(date);

        const lookup = parts.reduce<Record<string, string>>((accumulator, part) => {
            accumulator[part.type] = part.value;
            return accumulator;
        }, {});

        const meridiem = lookup['dayPeriod'] ? ` ${lookup['dayPeriod']}` : '';

        return `${lookup['day']}/${lookup['month']}/${lookup['year']} ${lookup['hour']}:${lookup['minute']}:${lookup['second']}${meridiem}`;
    }

    private parseConfiguredAtValue(value: string | Date): Date
    {
        if (value instanceof Date)
        {
            return value;
        }

        const hasTimezoneSuffix = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
        return new Date(hasTimezoneSuffix ? value : `${value}Z`);
    }

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
            this.setupRealtimeRefresh();
    }

    ionViewWillEnter(): void
    {
        this.LoadDomains();
        this.LoadCurrentSchoolYear();
    }

    LoadDomains(forceRefresh: boolean = false) 
    {
        const loadDomains = () => this.apollo.query<any>({ query: GET_DOMAINS, fetchPolicy: 'network-only' }).pipe(
            map((res: any) => res?.data?.GetAllowedDomains ?? [])
        );

        const request$ = forceRefresh
            ? this.queryCache.refresh(
                'admin-config-domains',
                [RealtimeScope.AllowedDomains],
                loadDomains
            )
            : this.queryCache.load(
            'admin-config-domains',
            [RealtimeScope.AllowedDomains],
            loadDomains
        );

        request$
            .subscribe({
                next: (domains: any[]) => {
                    this.runInZone(() => {
                        this.domains = domains;
                        this.isDomainsLoaded = true;
                        this.cdr.detectChanges();
                    });
                },
                error: (err) => {
                    this.runInZone(() => {
                        console.error('Error de red al obtener dominios permitidos:', err);
                        this.isDomainsLoaded = true;
                        this.cdr.detectChanges();
                    });
                }
            });
    }

    LoadCurrentSchoolYear(forceRefresh: boolean = false)
    {
        const loadCurrentSchoolYear = () => this.apollo.query<any>({ query: GET_CURRENT_SCHOOL_YEAR, fetchPolicy: 'network-only' }).pipe(
            map((res: any) => res?.data?.GetCurrentSchoolYear ?? null)
        );

        const request$ = forceRefresh
            ? this.queryCache.refresh(
                'admin-config-current-school-year',
                [RealtimeScope.CurrentSchoolYear],
                loadCurrentSchoolYear
            )
            : this.queryCache.load(
            'admin-config-current-school-year',
            [RealtimeScope.CurrentSchoolYear],
            loadCurrentSchoolYear
        );

        request$
            .subscribe({
                next: (currentSchoolYear: any) => {
                    this.runInZone(() => {
                        this.currentSchoolYear = currentSchoolYear;
                        this.isCurrentSchoolYearLoaded = true;
                        this.cdr.detectChanges();
                    });
                },
                error: (err) => {
                    this.runInZone(() => {
                        console.error('Error de red al obtener ciclo escolar actual:', err);
                        this.isCurrentSchoolYearLoaded = true;
                        this.cdr.detectChanges();
                    });
                }
            });
    }

    AddDomain() 
    {
      const domain = this.newDomain.trim().toLowerCase();

      if (!domain)
      {
        return;
      }

        const previousDomains = [...this.domains];
        const optimisticDomain = {
            id: `temp-${Date.now()}`,
            domain,
        };

        this.domains = [...this.domains, optimisticDomain];
        this.isDomainsLoaded = true;
        this.newDomain = '';
        this.cdr.detectChanges();
        
        this.apollo.mutate({
            mutation: ADD_DOMAIN,
            variables: { domain },
        }).subscribe({
        next: (result: any) =>
        {
                const createdDomain = result?.data?.CreateAllowedDomain;
                this.runInZone(() => {
                    this.domains = createdDomain
                        ? [...previousDomains, createdDomain]
                        : previousDomains;
                    this.isDomainsLoaded = true;
                    this.cdr.detectChanges();
                });
                this.LoadDomains(true);
            },
            error: (err) => {
                this.runInZone(() => {
                    this.domains = previousDomains;
                    this.newDomain = domain;
                    this.isDomainsLoaded = true;
                    this.cdr.detectChanges();
                });
                this.notifications.danger('Error al agregar dominio: ' + err.message);
            }
        });
    }

    AddSchoolYear()
    {
        const startDate = this.newSchoolYearStart.trim();
        const endDate = this.newSchoolYearEnd.trim();

        if (!startDate || !endDate)
        {
            return;
        }

        const previousSchoolYear = this.currentSchoolYear;
        this.currentSchoolYear = {
            id: previousSchoolYear?.id ?? 'pending',
            startDate,
            endDate,
            createdAt: new Date().toISOString()
        };
        this.cdr.detectChanges();

        this.apollo.mutate({
            mutation: SET_CURRENT_SCHOOL_YEAR,
            variables: { startDate, endDate },
        }).subscribe({
            next: (res: any) => {
                console.debug('SetCurrentSchoolYear response:', res);
                this.runInZone(() => {
                    const updatedSchoolYear = res?.data?.SetCurrentSchoolYear;
                    if (updatedSchoolYear) {
                        this.currentSchoolYear = updatedSchoolYear;
                    }
                    this.notifications.success('Ciclo en curso actualizado: ' + startDate + ' - ' + endDate, 'Ciclo escolar actualizado');
                    this.newSchoolYearStart = '';
                    this.newSchoolYearEnd = '';
                    this.cdr.detectChanges();
                });
                this.LoadCurrentSchoolYear(true);
            },
            error: (err) => {
                this.runInZone(() => {
                    this.currentSchoolYear = previousSchoolYear;
                    this.newSchoolYearStart = startDate;
                    this.newSchoolYearEnd = endDate;
                    this.cdr.detectChanges();
                });
                this.notifications.danger('Error al guardar ciclo escolar: ' + err.message);
            }
        });
    }

    async RemoveDomain(id: number)
    {
        if (!(await this.notifications.confirm({
            title: 'Eliminar dominio',
            message: '¿Eliminar este dominio?',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            confirmColor: 'danger',
            styleType: 'danger'
        }))) {
            return;
        }

        const domainId = Number(id);
        const previousDomains = [...this.domains];

        this.domains = this.domains.filter((domain: any) => Number(domain.id) !== domainId);
        this.isDomainsLoaded = true;
        this.cdr.detectChanges();

        this.apollo.mutate(
        {
            mutation: REMOVE_DOMAIN,
            variables: { id: domainId }
        }).subscribe({
            next: () => {
                this.runInZone(() => {
                    this.cdr.detectChanges();
                });
                this.LoadDomains(true);
            },
            error: (err) => {
                this.runInZone(() => {
                    this.domains = previousDomains;
                    this.isDomainsLoaded = true;
                    this.cdr.detectChanges();
                });
                this.notifications.danger('Error al eliminar dominio: ' + err.message);
            }
        });
    }

    private setupRealtimeRefresh(): void
    {
        this.realtimeSync.watchScopes([RealtimeScope.AllowedDomains, RealtimeScope.Users, RealtimeScope.CurrentSchoolYear])
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                this.LoadDomains(true);
                this.LoadCurrentSchoolYear(true);
            });
    }
}
