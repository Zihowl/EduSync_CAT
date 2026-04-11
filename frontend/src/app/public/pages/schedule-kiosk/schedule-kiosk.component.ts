import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import {
    IonContent, IonSelect,
    IonSelectOption, IonIcon,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonChip, IonSpinner, IonNote,
    IonSegment, IonSegmentButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
    calendarOutline, timeOutline, personOutline, bookOutline,
    businessOutline, layersOutline, schoolOutline
} from 'ionicons/icons';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { environment } from '../../../../environments/environment';
import { RealtimeQueryCacheService } from '../../../core/services/realtime-query-cache.service';
import { RealtimeScope, RealtimeSyncService } from '../../../core/services/realtime-sync.service';
import { ScheduleCalendarComponent } from '../../../shared/components/schedule-calendar/schedule-calendar.component';
import {
    buildVisibleScheduleDays,
    SCHEDULE_DEFAULT_END_MINUTE,
    SCHEDULE_DEFAULT_START_MINUTE,
    SCHEDULE_DEFAULT_VISIBLE_DAYS,
    normalizeDayOfWeek,
    ScheduleCalendarEvent,
} from '../../../shared/components/schedule-calendar/schedule-calendar.model';

interface ScheduleSlot {
    id: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subgroup: string | null;
    teacher?: { id: number; name: string } | null;
    subject: { id: number; name: string; grade?: number | null };
    classroom: { id: number; name: string };
    group: { id: number; name: string; parent?: { id: number; name: string } };
}

const DAYS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

@Component({
    selector: 'app-schedule-kiosk',
    standalone: true,
    imports: [
        CommonModule, FormsModule, IonContent,
        IonSelect, IonSelectOption, IonIcon, IonNote,
        IonCard, IonCardHeader, IonCardTitle, IonCardContent,
        IonChip, IonSpinner,
        IonSegment, IonSegmentButton, PageHeaderComponent, ScheduleCalendarComponent
    ],
    template: `
        <app-page-header title="Consulta de Horarios" subtitle="Vista de solo lectura">
            <ion-icon pageHeaderStart name="school-outline" class="kiosk-title-icon"></ion-icon>
        </app-page-header>

        <ion-content class="ion-padding kiosk-content">
            <div class="app-page-shell app-page-shell--wide kiosk-shell">
                <ion-card class="kiosk-hero-card app-page-section">
                    <ion-card-content>
                        <div class="kiosk-hero">
                            <div class="kiosk-hero__copy">
                                <p class="kiosk-kicker">Consulta pública</p>
                                <h2>Horario tipo calendario con eje de días y horas</h2>
                                <p class="kiosk-description">
                                    Selecciona un grupo y recorre su semana en una vista de solo lectura. Puedes cambiar entre semana y día para centrarte en un bloque específico.
                                </p>
                            </div>

                            <div class="kiosk-hero__stats">
                                <ion-chip color="primary">{{ schedules.length }} bloques</ion-chip>
                                <ion-chip color="success">{{ groups.length }} grupos</ion-chip>
                            </div>
                        </div>

                        <div class="kiosk-toolbar">
                            <ion-select
                                [(ngModel)]="selectedGroupId"
                                (ionChange)="LoadSchedules()"
                                placeholder="Selecciona un grupo..."
                                interface="popover"
                                [interfaceOptions]="{ animated: false }"
                                class="kiosk-select">
                                <ion-select-option *ngFor="let g of groups" [value]="g.id">
                                    {{ g.parent ? g.parent.name + '-' : '' }}{{ g.name }}
                                </ion-select-option>
                            </ion-select>

                            <ion-segment [(ngModel)]="viewMode" (ionChange)="onViewModeChange()" class="kiosk-segment">
                                <ion-segment-button value="week">Semana</ion-segment-button>
                                <ion-segment-button value="day">Día</ion-segment-button>
                            </ion-segment>
                        </div>

                        <div *ngIf="viewMode === 'day'" class="kiosk-day-strip">
                            <button
                                *ngFor="let d of calendarWeekDays"
                                type="button"
                                class="kiosk-day-strip__button"
                                [class.kiosk-day-strip__button--active]="selectedDay === d"
                                (click)="selectDay(d)">
                                {{ getDayShort(d) }}
                            </button>
                        </div>
                    </ion-card-content>
                </ion-card>

                <div *ngIf="selectedGroupId && !loading; else kioskEmptyState" class="kiosk-main-grid">
                    <ion-card class="kiosk-calendar-card app-page-section">
                        <ion-card-content>
                            <app-schedule-calendar
                                [events]="calendarEvents"
                                [visibleDays]="calendarDays"
                                [startMinute]="calendarStartMinute"
                                [endMinute]="calendarEndMinute"
                                [highlightedDay]="viewMode === 'day' ? selectedDay : null"
                                [showCurrentTimeMarker]="true"
                                [loaded]="!loading"
                                [emptyTitle]="calendarEmptyTitle"
                                [emptySubtitle]="calendarEmptySubtitle"
                                (eventSelected)="onCalendarEventSelected($event)">
                            </app-schedule-calendar>
                        </ion-card-content>
                    </ion-card>

                    <ion-card class="kiosk-details-card app-page-section">
                        <ion-card-header>
                            <ion-card-title>Detalle</ion-card-title>
                        </ion-card-header>

                        <ion-card-content *ngIf="selectedSchedule; else kioskNoSelection">
                            <p class="kiosk-details__kicker">{{ getDayName(selectedSchedule.dayOfWeek) }}</p>
                            <h3 class="kiosk-details__title">{{ getSubjectLabel(selectedSchedule.subject) }}</h3>
                            <ion-chip color="primary" outline class="kiosk-details__time">
                                {{ formatTime(selectedSchedule.startTime) }} - {{ formatTime(selectedSchedule.endTime) }}
                            </ion-chip>

                            <div class="kiosk-details__rows">
                                <div>
                                    <span>Docente</span>
                                    <strong>{{ selectedSchedule.teacher?.name || 'Sin docente' }}</strong>
                                </div>
                                <div>
                                    <span>Aula</span>
                                    <strong>{{ selectedSchedule.classroom.name }}</strong>
                                </div>
                                <div>
                                    <span>Grupo</span>
                                    <strong>{{ getGroupLabel(selectedSchedule.group) }}</strong>
                                </div>
                                <div *ngIf="selectedSchedule.subgroup">
                                    <span>Subgrupo</span>
                                    <strong>{{ selectedSchedule.subgroup }}</strong>
                                </div>
                            </div>

                            <ion-note>Esta vista es de solo lectura y se actualiza en tiempo real cuando cambia el horario publicado.</ion-note>
                        </ion-card-content>

                        <ng-template #kioskNoSelection>
                            <ion-card-content>
                                <div class="kiosk-details__empty">
                                    <ion-icon name="calendar-outline" class="kiosk-details__empty-icon"></ion-icon>
                                    <h3>Selecciona un bloque</h3>
                                    <p>Haz clic en una clase para ver sus detalles sin salir del calendario.</p>
                                </div>
                            </ion-card-content>
                        </ng-template>
                    </ion-card>
                </div>

                <ng-template #kioskEmptyState>
                    <ion-card class="kiosk-empty-card app-page-section">
                        <ion-card-content *ngIf="loading; else kioskInitialState">
                            <div class="kiosk-loading-state">
                                <ion-spinner name="crescent"></ion-spinner>
                                <p>Cargando horarios...</p>
                            </div>
                        </ion-card-content>

                        <ng-template #kioskInitialState>
                            <div class="kiosk-welcome-state">
                                <ion-icon name="school-outline" class="kiosk-welcome-icon"></ion-icon>
                                <h2>Bienvenido</h2>
                                <p>Selecciona un grupo para ver su horario de clases</p>
                            </div>
                        </ng-template>
                    </ion-card>
                </ng-template>
            </div>
        </ion-content>
    `,
    styleUrls: ['./schedule-kiosk.component.scss']
})
export class ScheduleKioskComponent implements OnInit {
    private http = inject(HttpClient);
    private queryCache = inject(RealtimeQueryCacheService);
    private realtimeSync = inject(RealtimeSyncService);
    private destroyRef = inject(DestroyRef);

    groups: any[] = [];
    schedules: ScheduleSlot[] = [];
    calendarEvents: ScheduleCalendarEvent[] = [];
    calendarDays: number[] = [...SCHEDULE_DEFAULT_VISIBLE_DAYS];
    calendarStartMinute = SCHEDULE_DEFAULT_START_MINUTE;
    calendarEndMinute = SCHEDULE_DEFAULT_END_MINUTE;
    calendarEmptyTitle = 'No hay bloques para este grupo';
    calendarEmptySubtitle = 'Prueba con otro grupo o revisa que el horario publicado tenga bloques disponibles.';
    selectedGroupId: number | null = null;
    selectedDay: number = 1;
    viewMode: 'week' | 'day' = 'week';
    calendarWeekDays = [...SCHEDULE_DEFAULT_VISIBLE_DAYS];
    selectedSchedule: ScheduleSlot | null = null;
    loading = false;

    private apiUrl = (environment.apiUrl || '').replace(/\/+$/, '');

    ngOnInit() {
        addIcons({
            calendarOutline, timeOutline, personOutline, bookOutline,
            businessOutline, layersOutline, schoolOutline
        });
        this.setupRealtimeRefresh();
    }

    ionViewWillEnter(): void {
        this.LoadGroups();
        if (this.selectedGroupId) {
            this.LoadSchedules();
        }
    }

    ionViewWillLeave(): void {
        this.loading = false;
    }

    getDayName(day: number): string {
        return DAYS[day] || '';
    }

    getDayShort(day: number): string {
        const shorts = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        return shorts[day] || '';
    }

    formatTime(time: string): string {
        return time ? time.substring(0, 5) : '';
    }

    getGroupLabel(group: ScheduleSlot['group']): string {
        if (!group) {
            return '';
        }

        return group.parent ? `${group.parent.name}-${group.name}` : group.name;
    }

    private getDefaultDay(): number {
        const current = normalizeDayOfWeek(new Date().getDay());
        return current === 7 ? 1 : current;
    }

    private syncCalendarState(): void {
        this.calendarWeekDays = buildVisibleScheduleDays(this.schedules.map((schedule) => schedule.dayOfWeek));
        this.calendarDays = this.viewMode === 'day'
            ? [this.selectedDay || this.getDefaultDay()]
            : [...this.calendarWeekDays];

        this.calendarEvents = this.schedules.map((schedule) => this.toCalendarEvent(schedule));
    }

    private toCalendarEvent(schedule: ScheduleSlot): ScheduleCalendarEvent {
        return {
            id: Number(schedule.id),
            dayOfWeek: schedule.dayOfWeek,
            startTime: this.formatTime(schedule.startTime),
            endTime: this.formatTime(schedule.endTime),
            title: this.getSubjectLabel(schedule.subject),
            subtitle: `${this.getDayName(schedule.dayOfWeek)} · ${this.formatTime(schedule.startTime)} - ${this.formatTime(schedule.endTime)}`,
            meta: [
                schedule.teacher?.name || 'Sin docente',
                this.getGroupLabel(schedule.group),
                schedule.classroom?.name || 'Sin aula'
            ].filter((value): value is string => Boolean(value)),
            selected: this.selectedSchedule != null && Number(this.selectedSchedule.id) === Number(schedule.id),
            payload: schedule,
        };
    }

    onViewModeChange(): void {
        if (this.viewMode === 'week') {
            this.selectedDay = this.getDefaultDay();
        }

        this.syncCalendarState();

        if (this.selectedGroupId) {
            this.LoadSchedules();
        }
    }

    selectDay(day: number): void {
        this.selectedDay = normalizeDayOfWeek(day);
        this.viewMode = 'day';
        this.syncCalendarState();

        if (this.selectedGroupId) {
            this.LoadSchedules();
        }
    }

    onCalendarEventSelected(event: ScheduleCalendarEvent): void {
        this.selectedSchedule = event.payload as ScheduleSlot;
        this.syncCalendarState();
    }

    getSubjectLabel(subject: ScheduleSlot['subject']): string {
        return subject?.grade != null ? `Grado ${subject.grade} - ${subject.name}` : subject?.name ?? '';
    }

    getSchedulesForDay(day: number): ScheduleSlot[] {
        return this.schedules
            .filter(s => s.dayOfWeek === day)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    LoadGroups() {
        this.queryCache.load(
            'public-schedule-groups',
            [RealtimeScope.Schedules, RealtimeScope.Groups],
            () => this.http.get<ScheduleSlot[]>(`${this.apiUrl}/api/public/schedules`).pipe(
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
                    this.selectedSchedule = null;
                    this.syncCalendarState();
                }
            },
            error: (err) => console.error('Error al cargar grupos:', err)
        });
    }

    LoadSchedules() {
        if (!this.selectedGroupId) return;

        this.loading = true;
        const effectiveDay = this.viewMode === 'day' ? this.selectedDay : null;
        this.queryCache.load(
            `public-schedule-group:${this.selectedGroupId}:${this.viewMode}:${effectiveDay ?? 'all'}`,
            [RealtimeScope.Schedules, RealtimeScope.Groups],
            () => {
                const dayQuery = effectiveDay ? `&dayOfWeek=${effectiveDay}` : '';
                return this.http.get<ScheduleSlot[]>(`${this.apiUrl}/api/public/schedules?groupId=${this.selectedGroupId}${dayQuery}`);
            }
        ).subscribe({
            next: (schedules: ScheduleSlot[]) => {
                this.schedules = schedules;
                this.loading = false;
                this.selectedSchedule = this.selectedSchedule
                    ? this.schedules.find(s => Number(s.id) === Number(this.selectedSchedule?.id)) ?? null
                    : null;

                if (this.viewMode === 'day') {
                    const firstDayWithClasses = this.getFirstDayWithClasses();
                    this.selectedDay = firstDayWithClasses ?? this.selectedDay;
                }

                this.syncCalendarState();
            },
            error: (err) => {
                console.error('Error al cargar horarios:', err);
                this.loading = false;
                this.syncCalendarState();
            }
        });
    }

    private getFirstDayWithClasses(): number | null {
        for (const day of ALL_DAYS) {
            if (this.schedules.some(schedule => schedule.dayOfWeek === day)) {
                return day;
            }
        }

        return null;
    }

    private setupRealtimeRefresh(): void {
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
