import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { map } from 'rxjs';
import {
    IonContent,
    IonList, IonItem, IonLabel, IonSelect,
    IonSelectOption, IonIcon, IonFab, IonFabButton,
    IonInput,
    IonSegment, IonSegmentButton, IonToggle,
    IonDatetime, IonDatetimeButton, IonPopover,
    IonCard, IonCardContent
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
    trashOutline, addOutline, pencilOutline, calendarOutline,
    timeOutline, personOutline, bookOutline, businessOutline,
    layersOutline, checkmarkCircleOutline, closeCircleOutline,
    eyeOutline, eyeOffOutline, gitBranchOutline
} from 'ionicons/icons';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ModalComponent } from '../../../shared/components/modal/modal.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { NotificationService } from '../../../shared/services/notification.service';
import { RealtimeQueryCacheService } from '../../../core/services/realtime-query-cache.service';
import { RealtimeScope, RealtimeSyncService } from '../../../core/services/realtime-sync.service';
import { ScheduleCalendarComponent } from '../../../shared/components/schedule-calendar/schedule-calendar.component';
import {
    formatClockTime,
    SCHEDULE_DEFAULT_END_MINUTE,
    SCHEDULE_DEFAULT_START_MINUTE,
    SCHEDULE_DEFAULT_VISIBLE_DAYS,
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
const SCHEDULE_QUERY_LIMIT = 500;

@Component({
    selector: 'app-schedules',
    standalone: true,
    imports: [
        CommonModule, FormsModule, IonContent,
        IonList, IonItem, IonLabel,
        IonSelect, IonSelectOption, IonIcon, IonFab, IonFabButton,
        IonSegment, IonSegmentButton, IonToggle,
        IonDatetime, IonDatetimeButton, IonPopover,
        IonCard, IonCardContent,
        ModalComponent,
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

        <ion-content class="ion-padding schedule-content" [scrollY]="false">
            <div class="app-page-shell app-page-shell--wide schedule-shell">
                
                <div class="schedule-controls">
                    <div class="schedule-controls__group">
                        <div class="schedule-dropdowns">
                            <ion-select [(ngModel)]="filterGroupId" (ionChange)="onGroupFilterChange()" (ionCancel)="onFilterSelectClosed($event)" (ionDismiss)="onFilterSelectClosed($event)" placeholder="Ninguno" interface="popover" [interfaceOptions]="{ animated: false }" class="schedule-filter glass-input">
                                <ion-select-option [value]="null">Ninguno</ion-select-option>
                                <ion-select-option *ngFor="let g of rootGroups" [value]="g.id">
                                    {{ getGroupLabel(g) }}
                                </ion-select-option>
                            </ion-select>

                            <ion-select [disabled]="filterGroupId == null" [(ngModel)]="filterSubgroupValue" (ionChange)="onSubgroupFilterChange()" (ionCancel)="onFilterSelectClosed($event)" (ionDismiss)="onFilterSelectClosed($event)" placeholder="Tronco común" interface="popover" [interfaceOptions]="{ animated: false }" class="schedule-filter glass-input">
                                <ion-select-option [value]="null">Tronco común</ion-select-option>
                                <ion-select-option *ngFor="let subgroup of availableSubgroups" [value]="subgroup">
                                    {{ subgroup }}
                                </ion-select-option>
                            </ion-select>

                            <ion-select [(ngModel)]="filterTeacherId" (ionChange)="onTeacherFilterChange()" (ionCancel)="onFilterSelectClosed($event)" (ionDismiss)="onFilterSelectClosed($event)" placeholder="Todos los maestros" interface="popover" [interfaceOptions]="{ animated: false }" class="schedule-filter glass-input">
                                <ion-select-option [value]="null">Todos los maestros</ion-select-option>
                                <ion-select-option *ngFor="let teacher of teachers" [value]="teacher.id">
                                    {{ teacher.name }}
                                </ion-select-option>
                            </ion-select>
                        </div>
                    </div>

                    <div class="schedule-controls__status">
                        <ion-segment [(ngModel)]="filterPublished" (ionChange)="onPublishedFilterChange()" class="schedule-segment glass-segment" mode="md">
                            <ion-segment-button value="all">
                                <ion-label>Todos</ion-label>
                            </ion-segment-button>
                            <ion-segment-button value="published">
                                <ion-label>Publicados</ion-label>
                            </ion-segment-button>
                            <ion-segment-button value="draft">
                                <ion-label>Borradores</ion-label>
                            </ion-segment-button>
                        </ion-segment>
                    </div>
                </div>

                <ion-card class="schedule-calendar-card app-page-section">
                    <ion-card-content>
                        <div class="schedule-calendar-frame">
                            <app-schedule-calendar
                                [events]="calendarEvents"
                                [visibleDays]="calendarDays"
                                [startMinute]="calendarStartMinute"
                                [endMinute]="calendarEndMinute"
                                [minuteHeight]="0.72"
                                [editable]="true"
                                [loaded]="isSchedulesLoaded"
                                [emptyTitle]="calendarEmptyTitle"
                                [emptySubtitle]="calendarEmptySubtitle"
                                [showCurrentTimeMarker]="true"
                                (eventSelected)="onCalendarEventSelected($event)"
                                (cellSelected)="onCalendarCellSelected($event)"
                                (actionSelected)="onCalendarActionSelected($event)"
                                (selectionToggled)="toggleSelectedId($event.id)">
                            </app-schedule-calendar>
                        </div>
                    </ion-card-content>
                </ion-card>
            </div>

            <ion-fab vertical="bottom" horizontal="end" slot="fixed">
                    <ion-fab-button (click)="OpenModal()">
                        <ion-icon name="add-outline"></ion-icon>
                    </ion-fab-button>
                </ion-fab>

                <app-modal
                    [isOpen]="isModalOpen"
                    (isOpenChange)="SetOpen($event)"
                    [title]="(editingItem ? 'Editar' : 'Nuevo') + ' Horario'"
                    subtitle="Completa los datos del horario y define su estado de publicación."
                    helperText="Revisa que la hora de fin sea posterior a la de inicio antes de guardar."
                    [saveLabel]="editingItem ? 'Actualizar' : 'Guardar'"
                    [saveDisabled]="!canSave()"
                    (save)="Save()">
                    <ng-template #modalBody>
                        <ion-list>
                            <ion-item fill="outline" class="schedule-form-item">
                                <ion-label position="stacked">Grupo *</ion-label>
                                <ion-select [(ngModel)]="formData.groupId" interface="popover" [interfaceOptions]="{ animated: false }" placeholder="Seleccionar grupo" [compareWith]="compareIds">
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
                                <ion-select [(ngModel)]="formData.subjectId" interface="popover" [interfaceOptions]="{ animated: false }" placeholder="Seleccionar materia" [compareWith]="compareIds">
                                    <ion-select-option *ngFor="let s of subjects" [value]="s.id">{{ getSubjectLabel(s) }}</ion-select-option>
                                </ion-select>
                                <ion-icon name="book-outline" slot="start"></ion-icon>
                            </ion-item>

                            <ion-item fill="outline" class="schedule-form-item">
                                <ion-label position="stacked">Docente (opcional)</ion-label>
                                <ion-select [(ngModel)]="formData.teacherId" interface="popover" [interfaceOptions]="{ animated: false }" placeholder="Seleccionar docente" [compareWith]="compareIds">
                                    <ion-select-option [value]="null">Sin docente</ion-select-option>
                                    <ion-select-option *ngFor="let t of teachers" [value]="t.id">{{ t.name }}</ion-select-option>
                                </ion-select>
                                <ion-icon name="person-outline" slot="start"></ion-icon>
                            </ion-item>

                            <ion-item fill="outline" class="schedule-form-item">
                                <ion-label position="stacked">Aula *</ion-label>
                                <ion-select [(ngModel)]="formData.classroomId" interface="popover" [interfaceOptions]="{ animated: false }" placeholder="Seleccionar aula" [compareWith]="compareIds">
                                    <ion-select-option *ngFor="let c of classrooms" [value]="c.id">{{ c.name }}</ion-select-option>
                                </ion-select>
                                <ion-icon name="business-outline" slot="start"></ion-icon>
                            </ion-item>

                            <ion-item fill="outline" class="schedule-form-item">
                                <ion-label position="stacked">Día de la semana *</ion-label>
                                <ion-select [(ngModel)]="formData.dayOfWeek" interface="popover" [interfaceOptions]="{ animated: false }">
                                    <ion-select-option *ngFor="let d of [1,2,3,4,5,6,7]" [value]="d">{{ getDayName(d) }}</ion-select-option>
                                </ion-select>
                                <ion-icon name="calendar-outline" slot="start"></ion-icon>
                            </ion-item>

                            <ion-item fill="outline" class="schedule-form-item">
                                <ion-label position="stacked">Hora de inicio *</ion-label>
                                <ion-datetime-button datetime="startTimePicker"></ion-datetime-button>
                                <ion-popover [keepContentsMounted]="true" [animated]="false">
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
                                <ion-popover [keepContentsMounted]="true" [animated]="false">
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
                    </ng-template>
                </app-modal>
        </ion-content>
    `,
    styleUrls: ['./schedules.component.scss']
})
export class SchedulesComponent implements OnInit {
    private apollo = inject(Apollo);
    private notifications = inject(NotificationService);
    private queryCache = inject(RealtimeQueryCacheService);
    private realtimeSync = inject(RealtimeSyncService);
    private destroyRef = inject(DestroyRef);
    private cdr = inject(ChangeDetectorRef);

    schedules: any[] = [];
    calendarEvents: ScheduleCalendarEvent[] = [];
    calendarDays: number[] = [...SCHEDULE_DEFAULT_VISIBLE_DAYS];
    calendarStartMinute = SCHEDULE_DEFAULT_START_MINUTE;
    calendarEndMinute = SCHEDULE_DEFAULT_END_MINUTE;
    get calendarEmptyTitle(): string {
        if (this.filterGroupId == null && this.filterTeacherId == null) {
            return 'Elige un filtro para comenzar';
        }
        return 'No se encontraron horarios';
    }

    get calendarEmptySubtitle(): string {
        if (this.filterGroupId == null && this.filterTeacherId == null) {
            return 'Selecciona un Grupo o Maestro en la parte superior para visualizar sus horarios.';
        }
        return 'No hay bloques disponibles con los filtros actuales. Ajusta tu selección para ver más resultados.';
    }
    allSchedules: any[] = [];
    teachers: any[] = [];
    subjects: any[] = [];
    classrooms: any[] = [];
    groups: any[] = [];
    rootGroups: any[] = [];
    availableSubgroups: string[] = [];
    isSchedulesLoaded = false;

    filterPublished: 'all' | 'published' | 'draft' = 'all';
    filterGroupId: number | null = null;
    filterSubgroupValue: string | null = null;
    filterTeacherId: number | null = null;

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

    ngOnInit() {
        addIcons({
            trashOutline, addOutline, pencilOutline, calendarOutline,
            timeOutline, personOutline, bookOutline, businessOutline,
            layersOutline, checkmarkCircleOutline, closeCircleOutline,
            eyeOutline, eyeOffOutline, gitBranchOutline
        });
        this.setupRealtimeRefresh();
    }

    ionViewWillEnter(): void {
        this.LoadCatalogs();
    }

    getDayName(day: number): string {
        return DAYS[day] || '';
    }

    getDayShortName(day: number): string {
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

    getGroupLabel(group: any): string {
        if (!group) return '';
        return group.parent ? `${group.parent.name}-${group.name}` : group.name;
    }

    getSubjectLabel(subject: any): string {
        if (!subject) return '';
        return subject.grade != null ? `Grado ${subject.grade} - ${subject.name}` : subject.name;
    }

    formatTime(time: string): string {
        if (!time) return '';
        // Toma solo HH:mm (primeros 5 caracteres)
        return time.substring(0, 5);
    }

    compareIds(o1: any, o2: any): boolean {
        return o1 != null && o2 != null && Number(o1) === Number(o2);
    }

    trackById(index: number, item: any): number {
        return item.id;
    }

    isUpdating(id: any): boolean {
        return this.updatingIds.includes(Number(id));
    }

    private normalizeSubgroupValue(value: string | null | undefined): string | null {
        const normalized = value?.trim();
        return normalized ? normalized : null;
    }

    private getScheduleRootGroupId(schedule: any): number | null {
        const groupId = schedule?.group?.parent?.id ?? schedule?.group?.id;
        return groupId != null ? Number(groupId) : null;
    }

    private ensureActiveFilterSelection(): void {
        if (this.filterGroupId != null) {
            const normalizedGroupId = this.getRootGroupId(this.filterGroupId);
            const hasValidGroup = normalizedGroupId != null && this.rootGroups.some((group) => Number(group.id) === Number(normalizedGroupId));
            if (!hasValidGroup) {
                this.filterGroupId = null;
            } else {
                this.filterGroupId = normalizedGroupId;
            }
        }

        if (this.filterTeacherId != null) {
            const hasValidTeacher = this.teachers.some((teacher) => Number(teacher.id) === Number(this.filterTeacherId));
            if (!hasValidTeacher) {
                this.filterTeacherId = null;
            }
        }
    }

    private syncAvailableSubgroups(): void {
        if (this.filterGroupId == null) {
            this.availableSubgroups = [];
            this.filterSubgroupValue = null;
            return;
        }

        const selectedGroupId = this.getRootGroupId(this.filterGroupId);
        if (selectedGroupId == null) {
            this.availableSubgroups = [];
            this.filterSubgroupValue = null;
            return;
        }

        const subgroupValues = new Set<string>();
        this.allSchedules.forEach((schedule) => {
            if (this.getScheduleRootGroupId(schedule) !== selectedGroupId) {
                return;
            }

            const subgroup = this.normalizeSubgroupValue(schedule.subgroup);
            if (subgroup) {
                subgroupValues.add(subgroup);
            }
        });

        this.availableSubgroups = Array.from(subgroupValues).sort((left, right) => left.localeCompare(right, 'es', { numeric: true, sensitivity: 'base' }));

        if (this.filterSubgroupValue != null && !this.availableSubgroups.includes(this.filterSubgroupValue)) {
            this.filterSubgroupValue = null;
        }
    }

    private matchesVisibleFilters(schedule: any): boolean {
        // If neither a group nor a teacher is explicitly selected, display NOTHING to prevent massive clutter.
        if (this.filterGroupId == null && this.filterTeacherId == null) {
            return false;
        }

        if (this.filterPublished === 'published' && !schedule.isPublished) {
            return false;
        }

        if (this.filterPublished === 'draft' && schedule.isPublished) {
            return false;
        }

        if (this.filterTeacherId != null && Number(schedule.teacher?.id) !== Number(this.filterTeacherId)) {
            return false;
        }

        if (this.filterGroupId != null) {
            const selectedGroupId = this.getRootGroupId(this.filterGroupId);
            if (selectedGroupId != null && this.getScheduleRootGroupId(schedule) !== selectedGroupId) {
                return false;
            }

            const selectedSubgroup = this.normalizeSubgroupValue(this.filterSubgroupValue);
            const scheduleSubgroup = this.normalizeSubgroupValue(schedule.subgroup);

            if (selectedSubgroup == null) {
                // If Tronco comun is selected, hide the specific subgroup ones
                if (scheduleSubgroup != null) return false;
            } else {
                // If a subgroup is selected, show only matching and cross-subgroup (Tronco Comun) ones
                if (scheduleSubgroup != null && scheduleSubgroup !== selectedSubgroup) return false;
            }
        }

        return true;
    }

    private applyVisibleFilters(): void {
        this.ensureActiveFilterSelection();
        this.syncAvailableSubgroups();

        this.schedules = this.allSchedules.filter((schedule) => this.matchesVisibleFilters(schedule));

        if (this.selectedSchedule) {
            this.selectedSchedule = this.schedules.find((schedule) => Number(schedule.id) === Number(this.selectedSchedule.id)) ?? null;
        }

        this.refreshCalendarView();
    }

    private clearFilterSelection(): void {
        this.selectedIds.clear();
        this.selectedSchedule = null;
        this.activeScheduleId = null;
    }

    private syncCalendarState(): void {
        this.activeScheduleId = this.selectedSchedule ? Number(this.selectedSchedule.id) : null;
        this.calendarEvents = this.schedules.map((schedule) => this.toCalendarEvent(schedule));
    }

    private getRootGroupId(groupId: number | null): number | null {
        if (groupId == null) {
            return null;
        }

        let currentGroupId = Number(groupId);
        const visited = new Set<number>();

        while (!visited.has(currentGroupId)) {
            visited.add(currentGroupId);
            const currentGroup = this.groups.find((group) => Number(group.id) === currentGroupId);
            const parentId = currentGroup?.parent?.id != null ? Number(currentGroup.parent.id) : null;

            if (parentId == null) {
                return currentGroupId;
            }

            currentGroupId = parentId;
        }

        return currentGroupId;
    }

    private getDefaultGroupId(): number | null {
        const fallbackGroup = this.rootGroups.find((group) => !group.parent) ?? this.rootGroups[0] ?? this.groups.find((group) => !group.parent) ?? this.groups[0];
        return fallbackGroup ? this.getRootGroupId(Number(fallbackGroup.id)) : null;
    }

    private toCalendarEvent(schedule: any): ScheduleCalendarEvent {
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

    private refreshCalendarView(): void {
        if (this.selectedSchedule) {
            this.selectedSchedule = this.schedules.find((schedule) => Number(schedule.id) === Number(this.selectedSchedule.id)) ?? null;
        }

        this.syncCalendarState();
    }

    onFilterChange(): void {
        this.ensureActiveFilterSelection();
        this.clearFilterSelection();
        this.applyVisibleFilters();
    }

    onGroupFilterChange(): void {
        this.clearFilterSelection();
        this.applyVisibleFilters();
    }

    onSubgroupFilterChange(): void {
        this.clearFilterSelection();
        this.applyVisibleFilters();
    }

    onTeacherFilterChange(): void {
        this.clearFilterSelection();
        this.applyVisibleFilters();
    }

    onFilterSelectClosed(event: Event): void {
        const select = event.target as HTMLIonSelectElement | null;

        if (!select) {
            return;
        }

        globalThis.setTimeout(() => select.blur(), 0);
    }

    onPublishedFilterChange(): void {
        this.clearFilterSelection();
        this.applyVisibleFilters();
    }

    onCalendarEventSelected(event: ScheduleCalendarEvent): void {
        const payload = event.payload ?? this.schedules.find((schedule) => Number(schedule.id) === Number(event.id));
        this.selectedSchedule = payload ?? null;
        this.activeScheduleId = Number(event.id);
        this.syncCalendarState();
    }

    onCalendarCellSelected(cell: ScheduleCalendarCellClick): void {
        const startTime = cell.time;
        const endTime = this.addMinutesToTime(startTime, 60);

        this.selectedSchedule = null;
        this.activeScheduleId = null;
        this.refreshCalendarView();
        this.OpenModal(null, {
            dayOfWeek: cell.dayOfWeek,
            startTime,
            endTime
        });
    }

    onCalendarActionSelected(actionClick: ScheduleCalendarActionClick): void {
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

    toggleSelectedId(id: number): void {
        const scheduleId = Number(id);
        if (this.selectedIds.has(scheduleId)) {
            this.selectedIds.delete(scheduleId);
        } else {
            this.selectedIds.add(scheduleId);
        }

        this.syncCalendarState();
    }

    private addMinutesToTime(time: string, minutes: number): string {
        const [hourText = '0', minuteText = '0'] = time.split(':');
        const hour = Number.parseInt(hourText, 10) || 0;
        const minute = Number.parseInt(minuteText, 10) || 0;
        const totalMinutes = (hour * 60) + minute + minutes;
        const normalizedTotal = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);

        return formatClockTime(normalizedTotal);
    }

    getTimeAsISO(time: string): string {
        return `2024-01-01T${time}:00`;
    }

    onStartTimeChange(event: any) {
        const value = event.detail.value;
        if (value) {
            const date = new Date(value);
            this.formData.startTime = date.toTimeString().substring(0, 5);
        }
    }

    onEndTimeChange(event: any) {
        const value = event.detail.value;
        if (value) {
            const date = new Date(value);
            this.formData.endTime = date.toTimeString().substring(0, 5);
        }
    }

    LoadCatalogs(forceRefresh = false) {
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
                this.rootGroups = catalogs.groups.filter((group: any) => !group.parent);
                if (this.rootGroups.length === 0) {
                    this.rootGroups = [...catalogs.groups];
                }
                this.ensureActiveFilterSelection();
                this.LoadSchedules(forceRefresh);
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error al cargar catalogos de horarios:', err);
                this.cdr.detectChanges();
            }
        });
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
                this.LoadCatalogs(true);
            });
    }

    LoadSchedules(forceRefresh = false) {
        const filter: any = {
            page: 1,
            limit: SCHEDULE_QUERY_LIMIT,
        };
        this.ensureActiveFilterSelection();

        const scheduleKey = [
            'admin-schedules',
            SCHEDULE_QUERY_LIMIT
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
                    variables: { filter },
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
                    variables: { filter },
                    fetchPolicy: 'network-only'
                }).pipe(
                    map((res: any) => res?.data?.GetSchedules ?? [])
                )
            );

        request$.subscribe({
            next: (schedules: any[]) => {
                this.allSchedules = schedules;
                this.isSchedulesLoaded = true;
                this.applyVisibleFilters();
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error al cargar horarios:', err);
                this.isSchedulesLoaded = true;
                this.applyVisibleFilters();
                this.cdr.detectChanges();
            }
        });
    }

    OpenModal(item: any = null, seed: Partial<typeof this.formData> = {}) {
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
                dayOfWeek: seed.dayOfWeek ?? this.calendarDays[0],
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

    SetOpen(isOpen: boolean) {
        this.isModalOpen = isOpen;

        if (!isOpen) {
            this.editingItem = null;
        }
    }

    CloseModal() {
        this.SetOpen(false);
    }

    hasChanges(): boolean {
        return JSON.stringify(this.formData) !== this.originalFormData;
    }

    isFormValid(): boolean {
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

    canSave(): boolean {
        if (!this.isFormValid()) return false;
        if (this.editingItem) {
            return this.hasChanges();
        }
        return true;
    }

    showToast(message: string, color: 'success' | 'warning' | 'danger' = 'success') {
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

    Save() {
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

    async Remove(id: number) {
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

    TogglePublish(schedule: any) {
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

    PublishSelected() {
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
