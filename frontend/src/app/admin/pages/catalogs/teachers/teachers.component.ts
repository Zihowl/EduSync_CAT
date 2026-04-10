import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { map } from 'rxjs';
import {
    IonContent, IonList, IonItem, IonButtons, IonLabel, IonAvatar,
    IonIcon, IonFab, IonFabButton,
    IonInput, IonButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { personOutline, trashOutline, addOutline, pencilOutline, mailOutline, cardOutline } from 'ionicons/icons';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { DataListComponent } from '../../../../shared/components/data-list/data-list.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { CatalogToolbarComponent } from '../../../../shared/components/catalog-toolbar/catalog-toolbar.component';
import { NotificationService } from '../../../../shared/services/notification.service';
import { getGraphQLErrorMessage } from '../../../../shared/utils/graphql-error';
import { RealtimeQueryCacheService } from '../../../../core/services/realtime-query-cache.service';
import { RealtimeScope, RealtimeSyncService } from '../../../../core/services/realtime-sync.service';
import { applyCatalogQuery, compareCatalogText, type CatalogToolbarState } from '../../../../shared/utils/catalog-query';

const GET_TEACHERS = gql`
    query GetTeachers {
        GetTeachers {
            id
            employeeNumber
            name
            email
        }
    }
`;

const CREATE_TEACHER = gql`
    mutation CreateTeacher($input: CreateTeacherInput!) {
        CreateTeacher(input: $input) {
            id
            name
        }
    }
`;

const UPDATE_TEACHER = gql`
    mutation UpdateTeacher($input: UpdateTeacherInput!) {
        UpdateTeacher(input: $input) {
            id
            employeeNumber
            name
            email
        }
    }
`;

const REMOVE_TEACHER = gql`
    mutation RemoveTeacher($id: Int!) {
        RemoveTeacher(id: $id)
    }
`;

@Component({
    selector: 'app-teachers',
    standalone: true,
    imports: [
        CommonModule, FormsModule, IonContent, IonList, IonItem,
        IonLabel, IonAvatar, IonButtons, IonIcon, IonFab,
        IonFabButton, IonInput, IonButton, PageHeaderComponent, DataListComponent, ModalComponent, CatalogToolbarComponent
    ],
    template: `
        <app-page-header title="Docentes" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding">
            <div class="app-page-shell app-page-shell--medium">
                <div class="app-page-section">
                    <app-catalog-toolbar
                        [state]="catalogToolbarState"
                        [sortOptions]="teacherSortOptions"
                        searchPlaceholder="Buscar docente..."
                        sortPlaceholder="Ordenar docentes"
                        clearLabel="Restablecer"
                        (stateChange)="OnToolbarChange($event)">
                    </app-catalog-toolbar>
                </div>
                <app-data-list
                    [items]="filteredTeachers"
                    [loaded]="isTeachersLoaded"
                    loadingText="Cargando docentes..."
                    emptyIcon="person-outline"
                    [emptyTitle]="catalogToolbarState.searchQuery.trim() ? 'No se encontraron docentes' : 'No hay docentes registrados'"
                    [emptySubtitle]="catalogToolbarState.searchQuery.trim() ? 'Prueba con otro nombre, número de empleado o correo' : 'Usa el botón + para crear el primer docente.'">
                    <ng-template #itemTemplate let-t>
                        <ion-item>
                            <ion-avatar slot="start" class="teacher-avatar">
                                <span class="teacher-initials">{{ GetInitials(t.name) }}</span>
                            </ion-avatar>
                            <ion-label>
                                <h2 class="teacher-name">{{ t.name }}</h2>
                                <p>No. Empleado: {{ t.employeeNumber }}</p>
                                <p>{{ t.email || 'Sin correo' }}</p>
                            </ion-label>
                            <ion-buttons slot="end">
                                <ion-button color="medium" (click)="OpenModal(t)">
                                    <ion-icon name="pencil-outline" slot="icon-only"></ion-icon>
                                </ion-button>
                                <ion-button color="danger" (click)="RemoveTeacher(t.id)">
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

                <app-modal
                    [(isOpen)]="isModalOpen"
                    [title]="(editingItem ? 'Editar' : 'Nuevo') + ' Docente'"
                    subtitle="Completa los datos principales del docente."
                    [saveLabel]="editingItem ? 'Actualizar' : 'Guardar'"
                    [saveDisabled]="!formData.name || !formData.employeeNumber"
                    (save)="Save()">
                    <ng-template #modalBody>
                        <ion-list>
                            <ion-item fill="outline">
                                <ion-label position="stacked">Nombre completo</ion-label>
                                <ion-input [(ngModel)]="formData.name" placeholder="Ej. Juan Pérez"></ion-input>
                                <ion-icon name="person-outline" slot="start"></ion-icon>
                            </ion-item>

                            <ion-item fill="outline">
                                <ion-label position="stacked">Número de empleado</ion-label>
                                <ion-input [(ngModel)]="formData.employeeNumber" placeholder="Ej. 123456"></ion-input>
                                <ion-icon name="card-outline" slot="start"></ion-icon>
                            </ion-item>

                            <ion-item fill="outline">
                                <ion-label position="stacked">Correo institucional</ion-label>
                                <ion-input type="email" [(ngModel)]="formData.email" placeholder="ejemplo@correo.com"></ion-input>
                                <ion-icon name="mail-outline" slot="start"></ion-icon>
                            </ion-item>
                        </ion-list>
                    </ng-template>
                </app-modal>
            </div>
        </ion-content>
    `,
    styleUrls: ['./teachers.component.scss']
})
export class TeachersComponent implements OnInit {
    private apollo = inject(Apollo);
    private queryCache = inject(RealtimeQueryCacheService);
    private realtimeSync = inject(RealtimeSyncService);
    private destroyRef = inject(DestroyRef);
    private cdr = inject(ChangeDetectorRef);
    private notifications = inject(NotificationService);

    teachers: any[] = [];
    filteredTeachers: any[] = [];
    catalogToolbarState: CatalogToolbarState = {
        searchQuery: '',
        sortValue: 'name',
        filters: {},
    };
    readonly teacherSortOptions = [
        { value: 'name', label: 'Nombre' },
        { value: 'employeeNumber', label: 'Número de empleado' },
        { value: 'email', label: 'Correo' },
    ];
    isTeachersLoaded = false;
    isModalOpen = false;
    editingItem: any = null;
    formData = {
        name: '',
        employeeNumber: '',
        email: ''
    };

    ngOnInit() {
        addIcons({ personOutline, trashOutline, addOutline, pencilOutline, mailOutline, cardOutline });
        this.setupRealtimeRefresh();
    }

    ionViewWillEnter(): void {
        this.LoadTeachers();
    }

    ionViewWillLeave(): void {
        this.isTeachersLoaded = true;
        this.cdr.detectChanges();
    }

    LoadTeachers(forceRefresh = false) {
        if (forceRefresh) {
            this.isTeachersLoaded = false;
        }

        const request$ = forceRefresh
            ? this.queryCache.refresh(
                'admin-teachers',
                [RealtimeScope.Teachers],
                () => this.apollo.query<any>({ query: GET_TEACHERS, fetchPolicy: 'network-only' }).pipe(
                    map((res: any) => res?.data?.GetTeachers ?? [])
                )
            )
            : this.queryCache.load(
                'admin-teachers',
                [RealtimeScope.Teachers],
                () => this.apollo.query<any>({ query: GET_TEACHERS, fetchPolicy: 'network-only' }).pipe(
                    map((res: any) => res?.data?.GetTeachers ?? [])
                )
            );

        request$.subscribe({
            next: (teachers: any[]) => {
                this.teachers = teachers ?? [];

                try {
                    this.ApplyFilter();
                } catch (err) {
                    console.error('Error al filtrar docentes:', err);
                    this.filteredTeachers = [...this.teachers];
                } finally {
                    this.isTeachersLoaded = true;
                    this.cdr.detectChanges();
                }
            },
            error: (err) => {
                console.error('Error al cargar docentes:', err);
                this.notifications.danger('Error al cargar docentes: ' + err.message);
                this.isTeachersLoaded = true;
                this.cdr.detectChanges();
            }
        });
    }

    OnToolbarChange(state: CatalogToolbarState) {
        this.catalogToolbarState = state;
        this.ApplyFilter();
    }

    ApplyFilter() {
        this.filteredTeachers = applyCatalogQuery(this.teachers, this.catalogToolbarState, {
            searchFields: [
                (teacher: any) => teacher?.name,
                (teacher: any) => teacher?.employeeNumber,
                (teacher: any) => teacher?.email,
            ],
            sortPredicates: {
                name: (left: any, right: any) => compareCatalogText(left?.name, right?.name),
                employeeNumber: (left: any, right: any) => compareCatalogText(left?.employeeNumber, right?.employeeNumber),
                email: (left: any, right: any) => compareCatalogText(left?.email, right?.email),
            },
            defaultSort: 'name',
        });
    }

    private setupRealtimeRefresh(): void {
        this.realtimeSync.watchScopes([RealtimeScope.Teachers])
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.LoadTeachers());
    }

    GetInitials(name: string): string {
        return (name ?? '')
            .split(' ')
            .map(n => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
    }

    OpenModal(item: any = null) {
        this.editingItem = item;
        if (item) {
            this.formData = { 
                name: item.name, 
                employeeNumber: item.employeeNumber, 
                email: item.email || '' 
            };
        } else {
            this.formData = { name: '', employeeNumber: '', email: '' };
        }
        this.isModalOpen = true;
    }

    Save() {
        if (!this.formData.name || !this.formData.employeeNumber) return;

        // Validar formato de email si se proporciona
        if (this.formData.email) {
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailRegex.test(this.formData.email)) {
                this.notifications.warning('Por favor, ingresa un correo electrónico válido (ej. usuario@dominio.com)', 'Correo inválido');
                return;
            }
        }

        const teacherInput = {
            name: this.formData.name,
            employeeNumber: this.formData.employeeNumber,
            email: this.formData.email || null
        };

        if (this.editingItem) {
            this.apollo.mutate({
                mutation: UPDATE_TEACHER,
                variables: { 
                    input: { 
                        id: Number(this.editingItem.id), 
                        ...teacherInput 
                    } 
                }
            }).subscribe({
                next: () => { 
                    this.isModalOpen = false;
                    this.editingItem = null;
                    this.LoadTeachers(true);
                },
                error: (err) => {
                    console.error('Error al actualizar docente:', err);
                    this.notifications.danger(getGraphQLErrorMessage(err, 'No se pudo guardar el docente.'));
                }
            });
        } else {
            this.apollo.mutate({
                mutation: CREATE_TEACHER,
                variables: { input: teacherInput },
            }).subscribe({
                next: () => { 
                    this.isModalOpen = false; 
                    this.LoadTeachers(true);
                },
                error: (err) => {
                    console.error('Error al crear docente:', err);
                    this.notifications.danger(getGraphQLErrorMessage(err, 'No se pudo guardar el docente.'));
                }
            });
        }
    }

    async RemoveTeacher(id: number) {
        if (!(await this.notifications.confirm({
            title: 'Eliminar docente',
            message: '¿Seguro que desea eliminar este docente?',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            confirmColor: 'danger',
            styleType: 'danger'
        }))) return;
        this.apollo.mutate({
            mutation: REMOVE_TEACHER,
            variables: { id: parseInt(id.toString()) },
        }).subscribe({
            next: () => this.LoadTeachers(true),
            error: (err) => this.notifications.danger(getGraphQLErrorMessage(err, 'No se pudo eliminar el docente.'))
        });
    }
}
