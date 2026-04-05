import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import {
    IonContent, IonSelect,
    IonSelectOption, IonItem, IonLabel, IonIcon,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonGrid, IonRow, IonCol, IonChip, IonSpinner, IonNote,
    IonSegment, IonSegmentButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
    calendarOutline, timeOutline, personOutline, bookOutline,
    businessOutline, layersOutline, schoolOutline
} from 'ionicons/icons';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataListComponent } from '../../../shared/components/data-list/data-list.component';
import { environment } from '../../../../environments/environment';
import { RealtimeQueryCacheService } from '../../../core/services/realtime-query-cache.service';
import { RealtimeScope, RealtimeSyncService } from '../../../core/services/realtime-sync.service';

interface ScheduleSlot {
    id: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subgroup: string | null;
    teacher?: { id: number; name: string } | null;
    subject: { id: number; name: string };
    classroom: { id: number; name: string };
    group: { id: number; name: string; parent?: { id: number; name: string } };
}

const DAYS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

@Component({
    selector: 'app-schedule-kiosk',
    standalone: true,
    imports: [
        CommonModule, FormsModule, IonContent,
        IonSelect, IonSelectOption, IonItem, IonLabel, IonIcon,
        IonCard, IonCardHeader, IonCardTitle, IonCardContent,
        IonGrid, IonRow, IonCol, IonChip, IonSpinner,
        IonSegment, IonSegmentButton, PageHeaderComponent, DataListComponent
    ],
    template: `
        <app-page-header title="Consulta de Horarios">
            <ion-icon pageHeaderStart name="school-outline" class="kiosk-title-icon"></ion-icon>
        </app-page-header>

        <ion-content class="ion-padding">
            <div class="app-page-shell app-page-shell--wide">
                <ion-grid>
                    <ion-row class="ion-justify-content-center">
                        <ion-col size="12" size-md="8" size-lg="6">
                            <ion-card>
                                <ion-card-header>
                                    <ion-card-title>Selecciona un grupo</ion-card-title>
                                </ion-card-header>
                                <ion-card-content>
                                    <ion-select
                                        [(ngModel)]="selectedGroupId"
                                        (ionChange)="LoadSchedules()"
                                        placeholder="Selecciona un grupo..."
                                        interface="action-sheet"
                                        class="kiosk-select">
                                        <ion-select-option *ngFor="let g of groups" [value]="g.id">
                                            {{ g.parent ? g.parent.name + '-' : '' }}{{ g.name }}
                                        </ion-select-option>
                                    </ion-select>
                                </ion-card-content>
                            </ion-card>
                        </ion-col>
                    </ion-row>

                    <ion-row *ngIf="selectedGroupId" class="ion-justify-content-center">
                        <ion-col size="12" size-md="10">
                            <ion-segment [(ngModel)]="viewMode" class="kiosk-segment">
                                <ion-segment-button value="list">Lista</ion-segment-button>
                                <ion-segment-button value="day">Por día</ion-segment-button>
                            </ion-segment>

                            <!-- Vista por día -->
                            <div *ngIf="viewMode === 'day'">
                                <ion-segment [(ngModel)]="selectedDay" scrollable>
                                    <ion-segment-button *ngFor="let d of [1,2,3,4,5,6]" [value]="d">
                                        {{ getDayShort(d) }}
                                    </ion-segment-button>
                                </ion-segment>

                                <app-data-list
                                    *ngIf="getSchedulesForDay(selectedDay).length > 0"
                                    class="ion-margin-top"
                                    [items]="getSchedulesForDay(selectedDay)"
                                    [loaded]="true"
                                    emptyIcon="calendar-outline"
                                    emptyTitle="No hay clases este día"
                                    [showCard]="true">
                                    <ng-template #itemTemplate let-s>
                                        <ion-item>
                                            <ion-icon name="time-outline" slot="start" color="primary"></ion-icon>
                                            <ion-label>
                                                <h2 class="kiosk-subject-title">{{ s.subject.name }}</h2>
                                                <p>{{ s.startTime.substring(0,5) }} - {{ s.endTime.substring(0,5) }}</p>
                                                <p>
                                                    <ion-icon name="person-outline" class="kiosk-inline-icon"></ion-icon>
                                                    {{ s.teacher?.name || 'Sin docente' }}
                                                </p>
                                                <p>
                                                    <ion-icon name="business-outline" class="kiosk-inline-icon"></ion-icon>
                                                    {{ s.classroom.name }}
                                                    <ion-chip *ngIf="s.subgroup" color="tertiary" class="kiosk-subgroup">{{ s.subgroup }}</ion-chip>
                                                </p>
                                            </ion-label>
                                        </ion-item>
                                    </ng-template>
                                </app-data-list>

                                <div *ngIf="getSchedulesForDay(selectedDay).length === 0" class="kiosk-empty-state">
                                    <ion-icon name="calendar-outline" class="kiosk-empty-icon"></ion-icon>
                                    <p>No hay clases este día</p>
                                </div>
                            </div>

                            <!-- Vista de lista completa -->
                            <div *ngIf="viewMode === 'list'">
                                <ng-container *ngFor="let day of [1,2,3,4,5,6]">
                                    <ion-card *ngIf="getSchedulesForDay(day).length > 0" class="kiosk-day-card">
                                        <ion-card-header color="light">
                                            <ion-card-title>
                                                <ion-icon name="calendar-outline" class="kiosk-day-icon"></ion-icon>
                                                {{ getDayName(day) }}
                                            </ion-card-title>
                                        </ion-card-header>
                                        <ion-card-content class="ion-no-padding">
                                            <app-data-list
                                                [items]="getSchedulesForDay(day)"
                                                [loaded]="true"
                                                [showCard]="false">
                                                <ng-template #itemTemplate let-s>
                                                    <ion-item>
                                                        <ion-label>
                                                            <h3 class="kiosk-subject-title">{{ s.subject.name }}</h3>
                                                            <p class="kiosk-time-badge">
                                                                <ion-chip color="primary" outline>
                                                                    {{ s.startTime.substring(0,5) }} - {{ s.endTime.substring(0,5) }}
                                                                </ion-chip>
                                                            </p>
                                                            <p>{{ s.teacher?.name || 'Sin docente' }} · {{ s.classroom.name }}</p>
                                                        </ion-label>
                                                        <ion-chip *ngIf="s.subgroup" slot="end" color="tertiary">{{ s.subgroup }}</ion-chip>
                                                    </ion-item>
                                                </ng-template>
                                            </app-data-list>
                                        </ion-card-content>
                                    </ion-card>
                                </ng-container>
                            </div>
                        </ion-col>
                    </ion-row>

                    <!-- Loading -->
                    <ion-row *ngIf="loading" class="ion-justify-content-center ion-padding">
                        <ion-spinner name="crescent"></ion-spinner>
                    </ion-row>

                    <!-- Estado inicial -->
                    <ion-row *ngIf="!selectedGroupId && !loading" class="ion-justify-content-center">
                        <ion-col size="12" class="kiosk-welcome-state">
                            <ion-icon name="school-outline" class="kiosk-welcome-icon"></ion-icon>
                            <h2>Bienvenido</h2>
                            <p>Selecciona un grupo para ver su horario de clases</p>
                        </ion-col>
                    </ion-row>
                </ion-grid>
            </div>
        </ion-content>
    `,
    styleUrls: ['./schedule-kiosk.component.scss']
})
export class ScheduleKioskComponent implements OnInit
{
    private http = inject(HttpClient);
    private queryCache = inject(RealtimeQueryCacheService);
    private realtimeSync = inject(RealtimeSyncService);
    private destroyRef = inject(DestroyRef);

    groups: any[] = [];
    schedules: ScheduleSlot[] = [];
    selectedGroupId: number | null = null;
    selectedDay: number = 1;
    viewMode: 'list' | 'day' = 'list';
    loading = false;

    private apiUrl = (environment.apiUrl || '').replace(/\/+$/, '');

    ngOnInit()
    {
        addIcons({
            calendarOutline, timeOutline, personOutline, bookOutline,
            businessOutline, layersOutline, schoolOutline
        });
        this.setupRealtimeRefresh();
    }

    ionViewWillEnter(): void
    {
        this.LoadGroups();
        if (this.selectedGroupId) {
            this.LoadSchedules();
        }
    }

    getDayName(day: number): string
    {
        return DAYS[day] || '';
    }

    getDayShort(day: number): string
    {
        const shorts = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        return shorts[day] || '';
    }

    getSchedulesForDay(day: number): ScheduleSlot[]
    {
        return this.schedules
            .filter(s => s.dayOfWeek === day)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    LoadGroups()
    {
        this.queryCache.load(
            'public-schedule-groups',
            [RealtimeScope.Schedules, RealtimeScope.Groups],
            () => this.http.get<ScheduleSlot[]>(`${this.apiUrl}/public/schedules`).pipe(
                map((schedules) => {
                    const groupMap = new Map<number, any>();
                    schedules.forEach(s => {
                        if (!groupMap.has(s.group.id)) {
                            groupMap.set(s.group.id, s.group);
                        }
                    });
                    return Array.from(groupMap.values()).sort((a, b) => {
                        const nameA = (a.parent?.name || '') + a.name;
                        const nameB = (b.parent?.name || '') + b.name;
                        return nameA.localeCompare(nameB);
                    });
                })
            )
        ).subscribe({
            next: (groups: any[]) => {
                this.groups = groups;

                if (this.selectedGroupId && !this.groups.some(g => Number(g.id) === Number(this.selectedGroupId))) {
                    this.selectedGroupId = null;
                    this.schedules = [];
                }
            },
            error: (err) => console.error('Error loading groups:', err)
        });
    }

    LoadSchedules()
    {
        if (!this.selectedGroupId) return;

        this.loading = true;
        this.queryCache.load(
            `public-schedule-group:${this.selectedGroupId}`,
            [RealtimeScope.Schedules, RealtimeScope.Groups],
            () => this.http.get<ScheduleSlot[]>(`${this.apiUrl}/public/schedules?groupId=${this.selectedGroupId}`)
        ).subscribe({
            next: (schedules: ScheduleSlot[]) => {
                this.schedules = schedules;
                this.loading = false;
                // Auto-select el primer día con clases
                for (let d = 1; d <= 6; d++) {
                    if (this.getSchedulesForDay(d).length > 0) {
                        this.selectedDay = d;
                        break;
                    }
                }
            },
            error: (err) => {
                console.error('Error loading schedules:', err);
                this.loading = false;
            }
        });
    }

    private setupRealtimeRefresh(): void
    {
        this.realtimeSync.watchScopes([
            RealtimeScope.Schedules,
            RealtimeScope.Teachers,
            RealtimeScope.Subjects,
            RealtimeScope.Classrooms,
            RealtimeScope.Groups,
        ])
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                this.LoadGroups();
                if (this.selectedGroupId) {
                    this.LoadSchedules();
                }
            });
    }
}
