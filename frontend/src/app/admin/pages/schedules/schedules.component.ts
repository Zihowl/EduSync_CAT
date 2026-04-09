import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { map } from 'rxjs';
import {
    IonContent, IonHeader, IonToolbar, IonTitle, IonButtons,
    IonList, IonItem, IonLabel, IonSelect,
    IonSelectOption, IonButton, IonIcon, IonFab, IonFabButton,
    IonModal, IonInput, IonFooter, IonChip,
    IonSegment, IonSegmentButton, IonToggle, IonNote,
    IonDatetime, IonDatetimeButton, IonPopover,
    IonCard, IonCardContent, IonCardHeader, IonCardTitle
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
    trashOutline, addOutline, pencilOutline, calendarOutline,
    timeOutline, personOutline, bookOutline, businessOutline,
    layersOutline, checkmarkCircleOutline, closeCircleOutline,
    eyeOutline, eyeOffOutline, gitBranchOutline
} from 'ionicons/icons';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { NotificationService } from '../../../shared/services/notification.service';
import { RealtimeQueryCacheService } from '../../../core/services/realtime-query-cache.service';
import { RealtimeScope, RealtimeSyncService } from '../../../core/services/realtime-sync.service';
import { ScheduleCalendarComponent } from '../../../shared/components/schedule-calendar/schedule-calendar.component';
import {
    formatClockTime,
    normalizeDayOfWeek,
    ScheduleCalendarActionClick,
    ScheduleCalendarCellClick,
    ScheduleCalendarEvent,
} from '../../../shared/components/schedule-calendar/schedule-calendar.model';

const GET_SCHEDULES = gql`
    query GetSchedules($filter: ScheduleFilterInput) {
        GetSchedules(filter: $filter) {
            id
            dayOfWeek
            startTime
            endTime
            subgroup
            isPublished
            teacher { id name }
            subject { id name grade }
            classroom { id name }
            group { id name parent { id name } }
            createdAt
        }
    }
`;

const GET_CATALOGS = gql`
    query GetCatalogs {
        GetTeachers { id name }
        GetSubjects { id name grade }
        GetClassrooms { id name }
        GetGroups { id name parent { id name } }
    }
`;

const CREATE_SCHEDULE = gql`
    mutation CreateScheduleSlot($input: CreateScheduleSlotInput!) {
        CreateScheduleSlot(input: $input) {
            id
            dayOfWeek
            startTime
            endTime
            isPublished
        }
    }
`;

const UPDATE_SCHEDULE = gql`
    mutation UpdateScheduleSlot($input: UpdateScheduleSlotInput!) {
        UpdateScheduleSlot(input: $input) {
            id
            dayOfWeek
            startTime
            endTime
            isPublished
        }
    }
`;

const REMOVE_SCHEDULE = gql`
    mutation RemoveScheduleSlot($id: Int!) {
        RemoveScheduleSlot(id: $id)
    }
`;

const SET_PUBLISHED = gql`
    mutation SetSchedulesPublished($ids: [Int!]!, $isPublished: Boolean!) {
        SetSchedulesPublished(ids: $ids, isPublished: $isPublished)
    }
`;

const DAYS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

@Component({
    selector: 'app-schedules',
    standalone: true,
    imports: [
        CommonModule, FormsModule, IonContent, IonHeader, IonToolbar,
        IonTitle, IonButtons, IonList, IonItem, IonLabel,
        IonSelect, IonSelectOption, IonButton, IonIcon, IonFab, IonFabButton,
        IonModal, IonFooter,
        IonSegment, IonSegmentButton, IonChip, IonToggle, IonNote,
        IonDatetime, IonDatetimeButton, IonPopover,
        IonCard, IonCardContent, IonCardHeader, IonCardTitle,
        PageHeaderComponent, ScheduleCalendarComponent
    ],
    template: `
        <app-page-header
            title="Horarios"
            [showBackButton]="true"
            backDefaultHref="/admin"
            [showActionButton]="true"
            actionButtonIcon="cloud-upload-outline"
            [actionButtonText]="selectedIds.size > 0 ? 'Publicar (' + selectedIds.size + ')' : 'Publicar selección'"
            actionButtonAriaLabel="Publicar horarios seleccionados"
            (actionButtonClick)="PublishSelected()"
        ></app-page-header>

        <ion-content class="ion-padding schedule-content">
            <div class="app-page-shell app-page-shell--wide schedule-shell">
                <ion-card class="schedule-hero-card app-page-section">
                    <ion-card-content>
                        <div class="schedule-hero">
                            <div class="schedule-hero__copy">
                                <p class="schedule-kicker">Calendario académico</p>
                                <h2>Administra bloques por día y hora</h2>
                                <p class="schedule-description">
                                    Haz clic en un bloque para revisar sus acciones o en una celda vacía para crear un nuevo horario con el mismo flujo visual.
                                </p>
                            </div>

                            <div class="schedule-hero__stats">
                                <ion-chip color="primary">{{ calendarEvents.length }} visibles</ion-chip>
                                <ion-chip color="success">{{ selectedIds.size }} seleccionados</ion-chip>
                                <ion-chip [color]="filterPublished === 'all' ? 'medium' : 'tertiary'">{{ getPublishedFilterLabel() }}</ion-chip>
                            </div>
                        </div>

                        <div class="schedule-toolbar">
                            <ion-segment [(ngModel)]="viewMode" (ionChange)="onViewModeChange()" class="schedule-segment">
                                <ion-segment-button value="week">Semana</ion-segment-button>
                                <ion-segment-button value="day">Día</ion-segment-button>
                            </ion-segment>

                            <ion-segment [(ngModel)]="filterPublished" (ionChange)="LoadSchedules()" class="schedule-segment">
                                <ion-segment-button value="all">Todos</ion-segment-button>
                                <ion-segment-button value="published">Publicados</ion-segment-button>
                                <ion-segment-button value="draft">Borradores</ion-segment-button>
                            </ion-segment>

                            <ion-select [(ngModel)]="filterGroupId" (ionChange)="LoadSchedules()" placeholder="Filtrar por grupo" interface="popover" class="schedule-filter">
                                <ion-select-option [value]="null">Todos los grupos</ion-select-option>
                                <ion-select-option *ngFor="let g of groups" [value]="g.id">
                                    {{ getGroupLabel(g) }}
                                </ion-select-option>
                            </ion-select>
                        </div>

                        <div *ngIf="viewMode === 'day'" class="schedule-day-strip">
                            <button
                                *ngFor="let d of calendarWeekDays"
                                type="button"
                                class="schedule-day-strip__button"
                                [class.schedule-day-strip__button--active]="filterDay === d"
                                (click)="selectDay(d)">
                                <span>{{ getDayShortName(d) }}</span>
                                <strong>{{ getDayName(d) }}</strong>
                            </button>
                        </div>
                    </ion-card-content>
                </ion-card>

                <div class="schedule-main-grid">
                    <ion-card class="schedule-calendar-card app-page-section">
                        <ion-card-content>
                            <app-schedule-calendar
                                [events]="calendarEvents"
                                [visibleDays]="calendarDays"
                                [highlightedDay]="viewMode === 'day' ? (filterDay || null) : null"
                                [editable]="true"
                                [showCurrentTimeMarker]="true"
                                (eventSelected)="onCalendarEventSelected($event)"
                                (cellSelected)="onCalendarCellSelected($event)"
                                (actionSelected)="onCalendarActionSelected($event)"
                                (selectionToggled)="toggleSelectedId($event.id)"
                                (dayHeaderSelected)="selectDay($event)">
                            </app-schedule-calendar>
                        </ion-card-content>
                    </ion-card>

                    <ion-card class="schedule-details-card app-page-section">
                        <ion-card-header>
                            <ion-card-title>Detalle del bloque</ion-card-title>
                        </ion-card-header>
                        <ion-card-content *ngIf="selectedSchedule; else scheduleEmptySelection">
                            <p class="schedule-details__kicker">{{ getDayName(selectedSchedule.dayOfWeek) }}</p>
                            <h3 class="schedule-details__title">{{ getSubjectLabel(selectedSchedule.subject) }}</h3>

                            <ion-chip [color]="selectedSchedule.isPublished ? 'success' : 'warning'" class="schedule-details__status">
                                {{ selectedSchedule.isPublished ? 'Publicado' : 'Borrador' }}
                            </ion-chip>

                            <div class="schedule-details__rows">
                                <div>
                                    <span>Horario</span>
                                    <strong>{{ formatTime(selectedSchedule.startTime) }} - {{ formatTime(selectedSchedule.endTime) }}</strong>
                                </div>
                                <div>
                                    <span>Grupo</span>
                                    <strong>{{ getGroupLabel(selectedSchedule.group) }}</strong>
                                </div>
                                <div *ngIf="selectedSchedule.subgroup">
                                    <span>Subgrupo</span>
                                    <strong>{{ selectedSchedule.subgroup }}</strong>
                                </div>
                                <div>
                                    <span>Docente</span>
                                    <strong>{{ selectedSchedule.teacher?.name || 'Sin docente' }}</strong>
                                </div>
                                <div>
                                    <span>Aula</span>
                                    <strong>{{ selectedSchedule.classroom?.name }}</strong>
                                </div>
                            </div>

                            <div class="schedule-details__actions">
                                <ion-button expand="block" fill="solid" (click)="OpenModal(selectedSchedule)">
                                    <ion-icon name="pencil-outline" slot="start"></ion-icon>
                                    Editar
                                </ion-button>
                                <ion-button expand="block" fill="outline" [color]="selectedSchedule.isPublished ? 'warning' : 'success'" (click)="TogglePublish(selectedSchedule)" [disabled]="isUpdating(selectedSchedule.id)">
                                    <ion-icon [name]="selectedSchedule.isPublished ? 'eye-off-outline' : 'eye-outline'" slot="start"></ion-icon>
                                    {{ selectedSchedule.isPublished ? 'Ocultar' : 'Publicar' }}
                                </ion-button>
                                <ion-button expand="block" fill="outline" color="danger" (click)="Remove(selectedSchedule.id)">
                                    <ion-icon name="trash-outline" slot="start"></ion-icon>
                                    Eliminar
                                </ion-button>
                            </div>

                            <ion-note>
                                Los cambios se sincronizan en tiempo real y el backend valida choques de hora para profesor y aula.
                            </ion-note>
                        </ion-card-content>

                        <ng-template #scheduleEmptySelection>
                            <ion-card-content>
                                <div class="schedule-details__empty">
                                    <ion-icon name="calendar-outline" class="schedule-details__empty-icon"></ion-icon>
                                    <h3>Sin bloque seleccionado</h3>
                                    <p>Selecciona un horario del calendario para revisar acciones rápidas, o toca una celda vacía para crear uno nuevo.</p>
                                </div>
                            </ion-card-content>
                        </ng-template>
                    </ion-card>
                </div>

                <ion-fab vertical="bottom" horizontal="end" slot="fixed">
                    <ion-fab-button (click)="OpenModal()">
                        <ion-icon name="add-outline"></ion-icon>
                    </ion-fab-button>
                </ion-fab>

                <!-- Modal de creación/edición -->
                <ion-modal class="audit-glass-modal" [isOpen]="isModalOpen" (didDismiss)="CloseModal()">
                    <ng-template>
                        <ion-header>
                            <ion-toolbar color="primary">
                                <ion-title>{{ editingItem ? 'Editar' : 'Nuevo' }} Horario</ion-title>
                                <ion-buttons slot="end">
                                    <ion-button (click)="CloseModal()">Cerrar</ion-button>
                                </ion-buttons>
                            </ion-toolbar>
                        </ion-header>
                        <ion-content class="ion-padding">
                            <ion-list>
                                <ion-item fill="outline" class="schedule-form-item">
                                    <ion-label position="stacked">Grupo *</ion-label>
                                    <ion-select [(ngModel)]="formData.groupId" interface="popover" placeholder="Seleccionar grupo" [compareWith]="compareIds">
                                        <ion-select-option *ngFor="let g of groups" [value]="g.id">
                                            {{ getGroupLabel(g) }}
                                        </ion-select-option>
                                    </ion-select>
                                    <ion-icon name="layers-outline" slot="start"></ion-icon>
                                </ion-item>

                                <ion-item fill="outline" class="schedule-form-item">
                                    <ion-label position="stacked">Subgrupo (opcional)</ion-label>
                                    <ion-input [(ngModel)]="formData.subgroup" type="text" placeholder="Ej. 1, Software, Principiantes"></ion-input>
                                    <ion-icon name="git-branch-outline" slot="start"></ion-icon>
                                </ion-item>

                                <ion-item fill="outline" class="schedule-form-item">
                                    <ion-label position="stacked">Materia *</ion-label>
                                    <ion-select [(ngModel)]="formData.subjectId" interface="popover" placeholder="Seleccionar materia" [compareWith]="compareIds">
                                        <ion-select-option *ngFor="let s of subjects" [value]="s.id">{{ getSubjectLabel(s) }}</ion-select-option>
                                    </ion-select>
                                    <ion-icon name="book-outline" slot="start"></ion-icon>
                                </ion-item>

                                <ion-item fill="outline" class="schedule-form-item">
                                    <ion-label position="stacked">Docente (opcional)</ion-label>
                                    <ion-select [(ngModel)]="formData.teacherId" interface="popover" placeholder="Seleccionar docente" [compareWith]="compareIds">
                                        <ion-select-option [value]="null">Sin docente</ion-select-option>
                                        <ion-select-option *ngFor="let t of teachers" [value]="t.id">{{ t.name }}</ion-select-option>
                                    </ion-select>
                                    <ion-icon name="person-outline" slot="start"></ion-icon>
                                </ion-item>

                                <ion-item fill="outline" class="schedule-form-item">
                                    <ion-label position="stacked">Aula *</ion-label>
                                    <ion-select [(ngModel)]="formData.classroomId" interface="popover" placeholder="Seleccionar aula" [compareWith]="compareIds">
                                        <ion-select-option *ngFor="let c of classrooms" [value]="c.id">{{ c.name }}</ion-select-option>
                                    </ion-select>
                                    <ion-icon name="business-outline" slot="start"></ion-icon>
                                </ion-item>

                                <ion-item fill="outline" class="schedule-form-item">
                                    <ion-label position="stacked">Día de la semana *</ion-label>
                                    <ion-select [(ngModel)]="formData.dayOfWeek" interface="popover">
                                        <ion-select-option *ngFor="let d of [1,2,3,4,5,6,7]" [value]="d">{{ getDayName(d) }}</ion-select-option>
                                    </ion-select>
                                    <ion-icon name="calendar-outline" slot="start"></ion-icon>
                                </ion-item>

                                <ion-item fill="outline" class="schedule-form-item">
                                    <ion-label position="stacked">Hora de inicio *</ion-label>
                                    <ion-datetime-button datetime="startTimePicker"></ion-datetime-button>
                                    <ion-popover [keepContentsMounted]="true">
                                        <ng-template>
                                            <ion-datetime
                                                id="startTimePicker"
                                                presentation="time"
                                                [value]="getTimeAsISO(formData.startTime)"
                                                (ionChange)="onStartTimeChange($event)"
                                                hourCycle="h12"
                                                minuteValues="0,5,10,15,20,25,30,35,40,45,50,55">
                                            </ion-datetime>
                                        </ng-template>
                                    </ion-popover>
                                    <ion-icon name="time-outline" slot="start"></ion-icon>
                                </ion-item>

                                <ion-item fill="outline" class="schedule-form-item">
                                    <ion-label position="stacked">Hora de fin *</ion-label>
                                    <ion-datetime-button datetime="endTimePicker"></ion-datetime-button>
                                    <ion-popover [keepContentsMounted]="true">
                                        <ng-template>
                                            <ion-datetime
                                                id="endTimePicker"
                                                presentation="time"
                                                [value]="getTimeAsISO(formData.endTime)"
                                                (ionChange)="onEndTimeChange($event)"
                                                hourCycle="h12"
                                                minuteValues="0,5,10,15,20,25,30,35,40,45,50,55">
                                            </ion-datetime>
                                        </ng-template>
                                    </ion-popover>
                                    <ion-icon name="time-outline" slot="start"></ion-icon>
                                </ion-item>

                                <ion-item>
                                    <ion-label>Publicar inmediatamente</ion-label>
                                    <ion-toggle [(ngModel)]="formData.isPublished" slot="end"></ion-toggle>
                                </ion-item>
                            </ion-list>

                            <div *ngIf="formData.startTime >= formData.endTime" class="schedule-time-error">
                                <small>La hora de fin debe ser posterior a la hora de inicio</small>
                            </div>
                        </ion-content>
                        <ion-footer class="ion-padding">
                            <ion-button expand="block" (click)="Save()" [disabled]="!canSave()">
                                {{ editingItem ? 'Actualizar' : 'Guardar' }}
                            </ion-button>
                        </ion-footer>
                    </ng-template>
                </ion-modal>
            </div>
        </ion-content>
    `,
    styleUrls: ['./schedules.component.scss']
})
export class SchedulesComponent implements OnInit
{
    private apollo = inject(Apollo);
    private notifications = inject(NotificationService);
    private queryCache = inject(RealtimeQueryCacheService);
    private realtimeSync = inject(RealtimeSyncService);
    private destroyRef = inject(DestroyRef);
    private cdr = inject(ChangeDetectorRef);

    schedules: any[] = [];
    calendarEvents: ScheduleCalendarEvent[] = [];
    calendarDays: number[] = [1, 2, 3, 4, 5, 6];
    teachers: any[] = [];
    subjects: any[] = [];
    classrooms: any[] = [];
    groups: any[] = [];
    isSchedulesLoaded = false;

    filterPublished: 'all' | 'published' | 'draft' = 'all';
    filterGroupId: number | null = null;
    filterDay: number | null = null;
    viewMode: 'week' | 'day' = 'week';
    calendarWeekDays = [1, 2, 3, 4, 5, 6];

    selectedIds = new Set<number>();
    updatingIds: number[] = [];
    isModalOpen = false;
    editingItem: any = null;
    selectedSchedule: any | null = null;
    activeScheduleId: number | null = null;
    originalFormData: string = '';

    formData = {
        groupId: null as number | null,
        subjectId: null as number | null,
        teacherId: null as number | null,
        classroomId: null as number | null,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '09:00',
        subgroup: '',
        isPublished: false
    };

    ngOnInit()
    {
        addIcons({
            trashOutline, addOutline, pencilOutline, calendarOutline,
            timeOutline, personOutline, bookOutline, businessOutline,
            layersOutline, checkmarkCircleOutline, closeCircleOutline,
            eyeOutline, eyeOffOutline, gitBranchOutline
        });
        this.setupRealtimeRefresh();
    }

    ionViewWillEnter(): void
    {
        this.LoadCatalogs();
        this.LoadSchedules();
    }

    getPublishedFilterLabel(): string
    {
        if (this.filterPublished === 'published') return 'Solo publicados';
        if (this.filterPublished === 'draft') return 'Solo borradores';
        return 'Todos los estados';
    }

    getDayName(day: number): string
    {
        return DAYS[day] || '';
    }

    getDayShortName(day: number): string
    {
        const shorts: Record<number, string> = {
            1: 'Lun',
            2: 'Mar',
            3: 'Mié',
            4: 'Jue',
            5: 'Vie',
            6: 'Sáb',
            7: 'Dom'
        };

        return shorts[day] || '';
    }

    getGroupLabel(group: any): string
    {
        if (!group) return '';
        return group.parent ? `${group.parent.name}-${group.name}` : group.name;
    }

    getSubjectLabel(subject: any): string
    {
        if (!subject) return '';
        return subject.grade != null ? `Grado ${subject.grade} - ${subject.name}` : subject.name;
    }

    formatTime(time: string): string
    {
        if (!time) return '';
        // Toma solo HH:mm (primeros 5 caracteres)
        return time.substring(0, 5);
    }

    compareIds(o1: any, o2: any): boolean
    {
        return o1 != null && o2 != null && Number(o1) === Number(o2);
    }

    trackById(index: number, item: any): number
    {
        return item.id;
    }

    isUpdating(id: any): boolean
    {
        return this.updatingIds.includes(Number(id));
    }

    private getDefaultDay(): number
    {
        const current = normalizeDayOfWeek(new Date().getDay());
        return current === 7 ? 1 : current;
    }

    private syncCalendarState(): void
    {
        this.calendarDays = this.viewMode === 'day'
            ? [this.filterDay ?? this.getDefaultDay()]
            : [...this.calendarWeekDays];

        this.activeScheduleId = this.selectedSchedule ? Number(this.selectedSchedule.id) : null;
        this.calendarEvents = this.schedules.map((schedule) => this.toCalendarEvent(schedule));
    }

    private toCalendarEvent(schedule: any): ScheduleCalendarEvent
    {
        const scheduleId = Number(schedule.id);
        const selected = this.selectedIds.has(scheduleId) || this.activeScheduleId === scheduleId;

        return {
            id: scheduleId,
            dayOfWeek: schedule.dayOfWeek,
            startTime: this.formatTime(schedule.startTime),
            endTime: this.formatTime(schedule.endTime),
            title: this.getSubjectLabel(schedule.subject),
            subtitle: `${this.getDayName(schedule.dayOfWeek)} · ${this.formatTime(schedule.startTime)} - ${this.formatTime(schedule.endTime)}`,
            meta: [
                schedule.teacher?.name || 'Sin docente',
                `${this.getGroupLabel(schedule.group)}${schedule.subgroup ? ` · ${schedule.subgroup}` : ''}`,
                schedule.classroom?.name || 'Sin aula'
            ].filter((value): value is string => Boolean(value)),
            statusLabel: schedule.isPublished ? 'Publicado' : 'Borrador',
            statusTone: schedule.isPublished ? 'success' : 'warning',
            selected,
            editable: true,
            blocked: this.isUpdating(scheduleId),
            payload: schedule,
            actions: [
                {
                    id: 'toggle-publish',
                    label: schedule.isPublished ? 'Ocultar' : 'Publicar',
                    icon: schedule.isPublished ? 'eye-off-outline' : 'eye-outline',
                    tone: schedule.isPublished ? 'warning' : 'success'
                },
                {
                    id: 'edit',
                    label: 'Editar',
                    icon: 'pencil-outline',
                    tone: 'medium'
                },
                {
                    id: 'delete',
                    label: 'Eliminar',
                    icon: 'trash-outline',
                    tone: 'danger'
                }
            ]
        };
    }

    private refreshCalendarView(): void
    {
        if (this.viewMode === 'day' && !this.filterDay) {
            this.filterDay = this.getDefaultDay();
        }

        if (this.selectedSchedule) {
            this.selectedSchedule = this.schedules.find((schedule) => Number(schedule.id) === Number(this.selectedSchedule.id)) ?? null;
        }

        this.syncCalendarState();
    }

    onViewModeChange(): void
    {
        if (this.viewMode === 'week') {
            this.filterDay = null;
        } else if (!this.filterDay) {
            this.filterDay = this.getDefaultDay();
        }

        this.refreshCalendarView();
        this.LoadSchedules();
    }

    selectDay(day: number): void
    {
        this.filterDay = normalizeDayOfWeek(day);
        this.viewMode = 'day';
        this.refreshCalendarView();
        this.LoadSchedules();
    }

    onCalendarEventSelected(event: ScheduleCalendarEvent): void
    {
        const payload = event.payload ?? this.schedules.find((schedule) => Number(schedule.id) === Number(event.id));
        this.selectedSchedule = payload ?? null;
        this.activeScheduleId = Number(event.id);
        this.syncCalendarState();
    }

    onCalendarCellSelected(cell: ScheduleCalendarCellClick): void
    {
        const startTime = cell.time;
        const endTime = this.addMinutesToTime(startTime, 60);

        this.selectedSchedule = null;
        this.activeScheduleId = null;
        this.viewMode = 'day';
        this.filterDay = normalizeDayOfWeek(cell.dayOfWeek);
        this.refreshCalendarView();
        this.OpenModal(null, {
            dayOfWeek: cell.dayOfWeek,
            startTime,
            endTime
        });
    }

    onCalendarActionSelected(actionClick: ScheduleCalendarActionClick): void
    {
        const schedule = actionClick.event.payload ?? this.schedules.find((item) => Number(item.id) === Number(actionClick.event.id));
        if (!schedule) {
            return;
        }

        switch (actionClick.action.id) {
            case 'edit':
                this.OpenModal(schedule);
                break;
            case 'toggle-publish':
                this.TogglePublish(schedule);
                break;
            case 'delete':
                void this.Remove(schedule.id);
                break;
        }
    }

    toggleSelectedId(id: number): void
    {
        const scheduleId = Number(id);
        if (this.selectedIds.has(scheduleId)) {
            this.selectedIds.delete(scheduleId);
        } else {
            this.selectedIds.add(scheduleId);
        }

        this.syncCalendarState();
    }

    private addMinutesToTime(time: string, minutes: number): string
    {
        const [hourText = '0', minuteText = '0'] = time.split(':');
        const hour = Number.parseInt(hourText, 10) || 0;
        const minute = Number.parseInt(minuteText, 10) || 0;
        const totalMinutes = (hour * 60) + minute + minutes;
        const normalizedTotal = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);

        return formatClockTime(normalizedTotal);
    }

    getTimeAsISO(time: string): string
    {
        return `2024-01-01T${time}:00`;
    }

    onStartTimeChange(event: any)
    {
        const value = event.detail.value;
        if (value) {
            const date = new Date(value);
            this.formData.startTime = date.toTimeString().substring(0, 5);
        }
    }

    onEndTimeChange(event: any)
    {
        const value = event.detail.value;
        if (value) {
            const date = new Date(value);
            this.formData.endTime = date.toTimeString().substring(0, 5);
        }
    }

    LoadCatalogs(forceRefresh = false)
    {
        const request$ = forceRefresh
            ? this.queryCache.refresh(
                'admin-schedules-catalogs',
                [RealtimeScope.Teachers, RealtimeScope.Subjects, RealtimeScope.Classrooms, RealtimeScope.Groups],
                () => this.apollo.query<any>({ query: GET_CATALOGS, fetchPolicy: 'network-only' }).pipe(
                    map((res: any) => ({
                        teachers: res?.data?.GetTeachers ?? [],
                        subjects: res?.data?.GetSubjects ?? [],
                        classrooms: res?.data?.GetClassrooms ?? [],
                        groups: res?.data?.GetGroups ?? [],
                    }))
                )
            )
            : this.queryCache.load(
                'admin-schedules-catalogs',
                [RealtimeScope.Teachers, RealtimeScope.Subjects, RealtimeScope.Classrooms, RealtimeScope.Groups],
                () => this.apollo.query<any>({ query: GET_CATALOGS, fetchPolicy: 'network-only' }).pipe(
                    map((res: any) => ({
                        teachers: res?.data?.GetTeachers ?? [],
                        subjects: res?.data?.GetSubjects ?? [],
                        classrooms: res?.data?.GetClassrooms ?? [],
                        groups: res?.data?.GetGroups ?? [],
                    }))
                )
            );

        request$.subscribe({
            next: (catalogs: any) => {
                this.teachers = catalogs.teachers;
                this.subjects = catalogs.subjects;
                this.classrooms = catalogs.classrooms;
                this.groups = catalogs.groups;
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error loading schedule catalogs:', err);
                this.cdr.detectChanges();
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
                this.LoadCatalogs(true);
                this.LoadSchedules(true);
            });
    }

    LoadSchedules(forceRefresh = false)
    {
        const filter: any = {};
        if (this.filterGroupId) filter.groupId = this.filterGroupId;
        const effectiveDay = this.viewMode === 'day' ? this.filterDay : null;
        if (effectiveDay) filter.dayOfWeek = effectiveDay;
        if (this.filterPublished === 'published') filter.isPublished = true;
        if (this.filterPublished === 'draft') filter.isPublished = false;

        const scheduleKey = [
            'admin-schedules',
            this.filterPublished,
            this.filterGroupId ?? 'all',
            this.viewMode,
            effectiveDay ?? 'all'
        ].join(':');

        if (forceRefresh) {
            this.isSchedulesLoaded = false;
        }

        const request$ = forceRefresh
            ? this.queryCache.refresh(
                scheduleKey,
                [RealtimeScope.Schedules, RealtimeScope.Teachers, RealtimeScope.Subjects, RealtimeScope.Classrooms, RealtimeScope.Groups],
                () => this.apollo.query<any>({
                    query: GET_SCHEDULES,
                    variables: { filter: Object.keys(filter).length > 0 ? filter : null },
                    fetchPolicy: 'network-only'
                }).pipe(
                    map((res: any) => res?.data?.GetSchedules ?? [])
                )
            )
            : this.queryCache.load(
                scheduleKey,
                [RealtimeScope.Schedules, RealtimeScope.Teachers, RealtimeScope.Subjects, RealtimeScope.Classrooms, RealtimeScope.Groups],
                () => this.apollo.query<any>({
                    query: GET_SCHEDULES,
                    variables: { filter: Object.keys(filter).length > 0 ? filter : null },
                    fetchPolicy: 'network-only'
                }).pipe(
                    map((res: any) => res?.data?.GetSchedules ?? [])
                )
            );

        request$.subscribe({
            next: (schedules: any[]) => {
                this.schedules = schedules;
                this.isSchedulesLoaded = true;
                this.selectedSchedule = this.selectedSchedule
                    ? this.schedules.find((schedule) => Number(schedule.id) === Number(this.selectedSchedule.id)) ?? null
                    : null;
                this.refreshCalendarView();
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error loading schedules:', err);
                this.isSchedulesLoaded = true;
                this.refreshCalendarView();
                this.cdr.detectChanges();
            }
        });
    }

    OpenModal(item: any = null, seed: Partial<typeof this.formData> = {})
    {
        this.editingItem = item;
        if (item) {
            this.selectedSchedule = item;
            this.activeScheduleId = Number(item.id);
            this.formData = {
                groupId: Number(item.group.id),
                subjectId: Number(item.subject.id),
                teacherId: item.teacher ? Number(item.teacher.id) : null,
                classroomId: Number(item.classroom.id),
                dayOfWeek: item.dayOfWeek,
                startTime: item.startTime.substring(0, 5),
                endTime: item.endTime.substring(0, 5),
                subgroup: item.subgroup || '',
                isPublished: item.isPublished
            };
        } else {
            this.formData = {
                groupId: seed.groupId ?? null,
                subjectId: seed.subjectId ?? null,
                teacherId: seed.teacherId ?? null,
                classroomId: seed.classroomId ?? null,
                dayOfWeek: seed.dayOfWeek ?? this.getDefaultDay(),
                startTime: seed.startTime ?? '08:00',
                endTime: seed.endTime ?? '09:00',
                subgroup: seed.subgroup ?? '',
                isPublished: seed.isPublished ?? false
            };
        }
        // Guardar estado original como JSON para comparar
        this.originalFormData = JSON.stringify(this.formData);
        this.syncCalendarState();
        this.isModalOpen = true;
    }

    CloseModal()
    {
        this.isModalOpen = false;
        this.editingItem = null;
    }

    hasChanges(): boolean
    {
        return JSON.stringify(this.formData) !== this.originalFormData;
    }

    isFormValid(): boolean
    {
        return !!(
            this.formData.groupId &&
            this.formData.subjectId &&
            this.formData.classroomId &&
            this.formData.dayOfWeek &&
            this.formData.startTime &&
            this.formData.endTime &&
            this.formData.startTime < this.formData.endTime
        );
    }

    canSave(): boolean
    {
        if (!this.isFormValid()) return false;
        if (this.editingItem) {
            return this.hasChanges();
        }
        return true;
    }

    showToast(message: string, color: 'success' | 'warning' | 'danger' = 'success')
    {
        if (color === 'danger') {
            this.notifications.danger(message, 'Error');
            return;
        }

        if (color === 'warning') {
            this.notifications.warning(message, 'Atención');
            return;
        }

        this.notifications.success(message, 'Horario');
    }

    Save()
    {
        if (!this.canSave()) return;

        const input: any = {
            groupId: Number(this.formData.groupId),
            subjectId: Number(this.formData.subjectId),
            teacherId: this.formData.teacherId === null ? null : Number(this.formData.teacherId),
            classroomId: Number(this.formData.classroomId),
            dayOfWeek: Number(this.formData.dayOfWeek),
            startTime: this.formData.startTime,
            endTime: this.formData.endTime,
            subgroup: this.formData.subgroup || null,
            isPublished: this.formData.isPublished
        };

        if (this.editingItem) {
            input.id = Number(this.editingItem.id);
            this.apollo.mutate({
                mutation: UPDATE_SCHEDULE,
                variables: { input }
            }).subscribe({
                next: () => {
                    this.CloseModal();
                    this.LoadSchedules(true);
                    this.showToast('Horario actualizado correctamente');
                },
                error: (err) => this.showToast('Error: ' + err.message, 'danger')
            });
        } else {
            this.apollo.mutate({
                mutation: CREATE_SCHEDULE,
                variables: { input }
            }).subscribe({
                next: () => {
                    this.CloseModal();
                    this.LoadSchedules(true);
                    this.showToast('Horario creado correctamente');
                },
                error: (err) => this.showToast('Error: ' + err.message, 'danger')
            });
        }
    }

    async Remove(id: number)
    {
        if (!(await this.notifications.confirm({
            title: 'Eliminar horario',
            message: '¿Eliminar este horario?',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            confirmColor: 'danger',
            styleType: 'danger'
        }))) return;

        this.apollo.mutate({
            mutation: REMOVE_SCHEDULE,
            variables: { id: Number(id) }
        }).subscribe({
            next: () => {
                this.LoadSchedules(true);
                this.showToast('Horario eliminado');
            },
            error: (err) => this.showToast('Error al eliminar: ' + err.message, 'danger')
        });
    }

    TogglePublish(schedule: any)
    {
        const newValue = !schedule.isPublished;
        const scheduleId = Number(schedule.id);

        // Agregar a lista de actualizando
        this.updatingIds = [...this.updatingIds, scheduleId];

        this.apollo.mutate({
            mutation: SET_PUBLISHED,
            variables: { ids: [scheduleId], isPublished: newValue }
        }).subscribe({
            next: () => {
                // Remover de lista de actualizando
                this.updatingIds = this.updatingIds.filter(id => id !== scheduleId);

                this.LoadSchedules(true);

                this.showToast(
                    newValue ? 'Horario publicado' : 'Horario ocultado',
                    newValue ? 'success' : 'warning'
                );
            },
            error: (err) => {
                this.updatingIds = this.updatingIds.filter(id => id !== scheduleId);
                this.showToast('Error: ' + err.message, 'danger');
            }
        });
    }

    PublishSelected()
    {
        if (this.selectedIds.size === 0) return;
        const ids = Array.from(this.selectedIds).map(id => Number(id));

        this.apollo.mutate({
            mutation: SET_PUBLISHED,
            variables: { ids, isPublished: true }
        }).subscribe({
            next: () => {
                this.LoadSchedules(true);
                this.selectedIds.clear();
                this.showToast(`${ids.length} horario(s) publicado(s)`);
            },
            error: (err) => this.showToast('Error: ' + err.message, 'danger')
        });
    }
}
