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
    IonSegment, IonSegmentButton, IonBadge, IonToggle, IonNote,
    IonDatetime, IonDatetimeButton, IonPopover
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
import { DataListComponent } from '../../../shared/components/data-list/data-list.component';
import { NotificationService } from '../../../shared/services/notification.service';
import { RealtimeQueryCacheService } from '../../../core/services/realtime-query-cache.service';
import { RealtimeScope, RealtimeSyncService } from '../../../core/services/realtime-sync.service';

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
            subject { id name }
            classroom { id name }
            group { id name parent { id name } }
            createdAt
        }
    }
`;

const GET_CATALOGS = gql`
    query GetCatalogs {
        GetTeachers { id name }
        GetSubjects { id name }
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
        IonSegment, IonSegmentButton, IonBadge, IonToggle,
        IonDatetime, IonDatetimeButton, IonPopover, PageHeaderComponent, DataListComponent
    ],
    template: `
        <app-page-header
            title="Horarios"
            [showBackButton]="true"
            backDefaultHref="/admin"
            [showActionButton]="true"
            actionButtonIcon="eye-outline"
            actionButtonText="Publicar"
            actionButtonAriaLabel="Publicar horarios seleccionados"
            (actionButtonClick)="PublishSelected()"
        ></app-page-header>

        <ion-content class="ion-padding">
            <div class="app-page-shell app-page-shell--wide">
            <div class="schedule-controls app-page-section">
                <ion-segment [(ngModel)]="filterPublished" (ionChange)="LoadSchedules()" class="schedule-segment">
                    <ion-segment-button value="all">Todos</ion-segment-button>
                    <ion-segment-button value="published">Publicados</ion-segment-button>
                    <ion-segment-button value="draft">Borradores</ion-segment-button>
                </ion-segment>

                <div class="schedule-filter-row">
                    <ion-select [(ngModel)]="filterGroupId" (ionChange)="LoadSchedules()" placeholder="Filtrar por grupo" interface="popover" class="schedule-filter">
                        <ion-select-option [value]="null">Todos los grupos</ion-select-option>
                        <ion-select-option *ngFor="let g of groups" [value]="g.id">
                            {{ g.parent ? g.parent.name + '-' : '' }}{{ g.name }}
                        </ion-select-option>
                    </ion-select>
                    <ion-select [(ngModel)]="filterDay" (ionChange)="LoadSchedules()" placeholder="Día" interface="popover" class="schedule-filter">
                        <ion-select-option [value]="null">Todos los días</ion-select-option>
                        <ion-select-option *ngFor="let d of [1,2,3,4,5,6,7]" [value]="d">{{ getDayName(d) }}</ion-select-option>
                    </ion-select>
                </div>
            </div>

            <app-data-list
                [items]="schedules"
                [loaded]="isSchedulesLoaded"
                [trackByFn]="trackById"
                loadingText="Cargando horarios..."
                emptyIcon="calendar-outline"
                emptyTitle="No hay horarios registrados"
                emptySubtitle="Revisa los filtros o crea el primer horario con el botón +">
                <ng-template #itemTemplate let-s>
                    <ion-item lines="none"
                              [class.schedule-published]="s.isPublished"
                              [class.schedule-updating]="isUpdating(s.id)">
                        <ion-icon name="calendar-outline" slot="start" [color]="s.isPublished ? 'success' : 'medium'"></ion-icon>
                        <ion-label>
                            <h2 class="schedule-subject-title">
                                {{ s.subject.name }}
                                <ion-badge [color]="s.isPublished ? 'success' : 'warning'" class="schedule-badge">
                                    {{ s.isPublished ? 'Publicado' : 'Borrador' }}
                                </ion-badge>
                            </h2>
                            <p>
                                <ion-icon name="time-outline" class="schedule-inline-icon"></ion-icon>
                                {{ getDayName(s.dayOfWeek) }} {{ formatTime(s.startTime) }} - {{ formatTime(s.endTime) }}
                            </p>
                            <p>
                                <ion-icon name="person-outline" class="schedule-inline-icon"></ion-icon>
                                {{ s.teacher?.name || 'Sin docente' }}
                            </p>
                            <p>
                                <ion-icon name="layers-outline" class="schedule-inline-icon"></ion-icon>
                                {{ s.group.parent ? s.group.parent.name + '-' : '' }}{{ s.group.name }}
                                <span *ngIf="s.subgroup" class="schedule-subgroup">({{ s.subgroup }})</span>
                            </p>
                            <p>
                                <ion-icon name="business-outline" class="schedule-inline-icon"></ion-icon>
                                {{ s.classroom.name }}
                            </p>
                        </ion-label>
                        <ion-buttons slot="end">
                            <ion-button [color]="s.isPublished ? 'warning' : 'success'" (click)="TogglePublish(s)" [disabled]="isUpdating(s.id)">
                                <ion-icon [name]="s.isPublished ? 'eye-off-outline' : 'eye-outline'" slot="icon-only"></ion-icon>
                            </ion-button>
                            <ion-button color="medium" (click)="OpenModal(s)">
                                <ion-icon name="pencil-outline" slot="icon-only"></ion-icon>
                            </ion-button>
                            <ion-button color="danger" (click)="Remove(s.id)">
                                <ion-icon name="trash-outline" slot="icon-only"></ion-icon>
                            </ion-button>
                        </ion-buttons>
                    </ion-item>
                </ng-template>
            </app-data-list>

            <ion-fab vertical="bottom" horizontal="end" slot="fixed">
                <ion-fab-button (click)="OpenModal()">
                    <ion-icon name="add-outline"></ion-icon>
                </ion-fab-button>
            </ion-fab>

            <!-- Modal de creación/edición -->
            <ion-modal [isOpen]="isModalOpen" (didDismiss)="CloseModal()">
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
                                        {{ g.parent ? g.parent.name + '-' : '' }}{{ g.name }}
                                    </ion-select-option>
                                </ion-select>
                                <ion-icon name="layers-outline" slot="start"></ion-icon>
                            </ion-item>

                            <ion-item fill="outline" class="schedule-form-item">
                                <ion-label position="stacked">Subgrupo (opcional)</ion-label>
                                <ion-select [(ngModel)]="formData.subgroup" interface="popover" placeholder="Sin subgrupo">
                                    <ion-select-option [value]="''">Sin subgrupo</ion-select-option>
                                    <ion-select-option *ngFor="let sg of subgroupOptions" [value]="sg">{{ sg }}</ion-select-option>
                                </ion-select>
                                <ion-icon name="git-branch-outline" slot="start"></ion-icon>
                            </ion-item>

                            <ion-item fill="outline" class="schedule-form-item">
                                <ion-label position="stacked">Materia *</ion-label>
                                <ion-select [(ngModel)]="formData.subjectId" interface="popover" placeholder="Seleccionar materia" [compareWith]="compareIds">
                                    <ion-select-option *ngFor="let s of subjects" [value]="s.id">{{ s.name }}</ion-select-option>
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
    teachers: any[] = [];
    subjects: any[] = [];
    classrooms: any[] = [];
    groups: any[] = [];
    isSchedulesLoaded = false;

    filterPublished: 'all' | 'published' | 'draft' = 'all';
    filterGroupId: number | null = null;
    filterDay: number | null = null;

    selectedIds = new Set<number>();
    updatingIds: number[] = [];
    isModalOpen = false;
    editingItem: any = null;
    originalFormData: string = '';

    subgroupOptions = ['A', 'B', 'C', 'D', 'Desarrollo', 'Diseño', 'Teoría', 'Práctica', 'Lab 1', 'Lab 2'];

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

    getDayName(day: number): string
    {
        return DAYS[day] || '';
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
        if (this.filterDay) filter.dayOfWeek = this.filterDay;
        if (this.filterPublished === 'published') filter.isPublished = true;
        if (this.filterPublished === 'draft') filter.isPublished = false;

        const scheduleKey = [
            'admin-schedules',
            this.filterPublished,
            this.filterGroupId ?? 'all',
            this.filterDay ?? 'all'
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
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error loading schedules:', err);
                this.isSchedulesLoaded = true;
                this.cdr.detectChanges();
            }
        });
    }

    OpenModal(item: any = null)
    {
        this.editingItem = item;
        if (item) {
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
                groupId: null,
                subjectId: null,
                teacherId: null,
                classroomId: null,
                dayOfWeek: 1,
                startTime: '08:00',
                endTime: '09:00',
                subgroup: '',
                isPublished: false
            };
        }
        // Guardar estado original como JSON para comparar
        this.originalFormData = JSON.stringify(this.formData);
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
