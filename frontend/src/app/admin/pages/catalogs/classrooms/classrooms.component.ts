import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { map } from 'rxjs';
import {
    IonContent, IonList, IonItem, IonButtons, IonLabel, IonSelect,
    IonSelectOption, IonButton, IonIcon, IonFab, IonFabButton,
    IonInput
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trashOutline, addOutline, pencilOutline, homeOutline } from 'ionicons/icons';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { DataListComponent } from '../../../../shared/components/data-list/data-list.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { CatalogToolbarComponent } from '../../../../shared/components/catalog-toolbar/catalog-toolbar.component';
import { NotificationService } from '../../../../shared/services/notification.service';
import { getGraphQLErrorMessage } from '../../../../shared/utils/graphql-error';
import { RealtimeQueryCacheService } from '../../../../core/services/realtime-query-cache.service';
import { RealtimeScope, RealtimeSyncService } from '../../../../core/services/realtime-sync.service';
import { applyCatalogQuery, compareCatalogText, type CatalogToolbarFilterConfig, type CatalogToolbarState } from '../../../../shared/utils/catalog-query';

const GET_CLASSROOMS = gql`
    query GetClassrooms {
        GetClassrooms {
            id
            name
            building { id name }
        }
    }
`;

const GET_BUILDINGS = gql`
    query GetBuildings {
        GetBuildings { id name }
    }
`;

const CREATE_CLASSROOM = gql`
    mutation CreateClassroom($input: CreateClassroomInput!) {
        CreateClassroom(input: $input) {
            id
            name
        }
    }
`;

const UPDATE_CLASSROOM = gql`
    mutation UpdateClassroom($input: UpdateClassroomInput!) {
        UpdateClassroom(input: $input) {
            id
            name
        }
    }
`;

const REMOVE_CLASSROOM = gql`
    mutation RemoveClassroom($id: Int!) {
        RemoveClassroom(id: $id)
    }
`;

@Component({
    selector: 'app-classrooms',
    standalone: true,
    imports: [
        CommonModule, FormsModule, IonContent, IonList, IonItem,
        IonLabel, IonSelect, IonSelectOption, IonButtons, IonButton, IonIcon,
        IonFab, IonFabButton, IonInput, PageHeaderComponent, DataListComponent, ModalComponent, CatalogToolbarComponent
    ],
    template: `
        <app-page-header title="Aulas" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding">
            <div class="app-page-shell app-page-shell--medium">
                <div class="app-page-section">
                    <app-catalog-toolbar
                        [state]="catalogToolbarState"
                        [filters]="classroomToolbarFilters"
                        [sortOptions]="classroomSortOptions"
                        searchPlaceholder="Buscar aula..."
                        sortPlaceholder="Ordenar aulas"
                        clearLabel="Restablecer"
                        (stateChange)="OnToolbarChange($event)">
                    </app-catalog-toolbar>
                </div>
                <app-data-list
                    [items]="filteredClassrooms"
                    [loaded]="isClassroomsLoaded"
                    loadingText="Cargando aulas..."
                    emptyIcon="home-outline"
                    [emptyTitle]="hasClassroomCriteria() ? 'No se encontraron aulas' : 'No hay aulas registradas'"
                    [emptySubtitle]="hasClassroomCriteria() ? 'Prueba con otro nombre o edificio' : 'Agrega la primera aula con el botón +'">
                    <ng-template #itemTemplate let-c>
                        <ion-item>
                            <ion-icon name="home-outline" slot="start" color="primary"></ion-icon>
                            <ion-label>
                                <h2 class="classroom-name">{{ c.name }}</h2>
                                <p *ngIf="c.building">Edificio: <strong>{{ c.building.name }}</strong></p>
                                <p *ngIf="!c.building" class="classroom-no-building">Sin edificio asignado</p>
                            </ion-label>
                            <ion-buttons slot="end">
                                <ion-button color="medium" (click)="OpenModal(c)">
                                    <ion-icon name="pencil-outline" slot="icon-only"></ion-icon>
                                </ion-button>
                                <ion-button color="danger" (click)="RemoveClassroom(c.id)">
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
                    [title]="(editingItem ? 'Editar' : 'Nueva') + ' Aula'"
                    subtitle="Asigna el aula y su edificio de referencia."
                    [saveLabel]="editingItem ? 'Actualizar' : 'Guardar'"
                    [saveDisabled]="!formData.name || !formData.buildingId"
                    (save)="Save()">
                    <ng-template #modalBody>
                        <ion-list>
                            <ion-item fill="outline">
                                <ion-label position="stacked">Nombre del aula / Salón</ion-label>
                                <ion-input [(ngModel)]="formData.name" placeholder="Ej. Laboratorio 1"></ion-input>
                            </ion-item>

                            <ion-item fill="outline">
                                <ion-label position="stacked">Edificio al que pertenece</ion-label>
                                <ion-select interface="popover" [(ngModel)]="formData.buildingId" placeholder="Seleccionar edificio">
                                    <ion-select-option *ngFor="let b of buildings" [value]="b.id">
                                        {{ b.name }}
                                    </ion-select-option>
                                </ion-select>
                            </ion-item>
                        </ion-list>
                    </ng-template>
                </app-modal>
            </div>
        </ion-content>
    `,
    styleUrls: ['./classrooms.component.scss']
})
export class ClassroomsComponent implements OnInit
{
    private apollo = inject(Apollo);
    private queryCache = inject(RealtimeQueryCacheService);
    private realtimeSync = inject(RealtimeSyncService);
    private destroyRef = inject(DestroyRef);
    private cdr = inject(ChangeDetectorRef);
    private notifications = inject(NotificationService);

    classrooms: any[] = [];
    buildings: any[] = [];
    filteredClassrooms: any[] = [];
    catalogToolbarState: CatalogToolbarState = {
        searchQuery: '',
        sortValue: 'buildingThenName',
        filters: {
            buildingId: '',
        },
    };
    classroomToolbarFilters: CatalogToolbarFilterConfig[] = [
        {
            key: 'buildingId',
            label: 'Edificio',
            placeholder: 'Filtrar por edificio',
            defaultValue: '',
            options: [
                { value: '', label: 'Todos' },
            ],
        },
    ];
    readonly classroomSortOptions = [
        { value: 'buildingThenName', label: 'Edificio y aula' },
        { value: 'name', label: 'Aula' },
    ];
    isClassroomsLoaded = false;
    isModalOpen = false;
    editingItem: any = null;
    formData = {
        name: '',
        buildingId: null as number | null
    };

    ngOnInit() {
        addIcons({ trashOutline, addOutline, pencilOutline, homeOutline });
        this.setupRealtimeRefresh();
    }

    ionViewWillEnter(): void {
        this.LoadBuildings();
        this.LoadClassrooms();
    }

    LoadBuildings(forceRefresh = false) {
        const request$ = forceRefresh
            ? this.queryCache.refresh(
                'admin-classrooms-buildings',
                [RealtimeScope.Buildings],
                () => this.apollo.query<any>({ query: GET_BUILDINGS, fetchPolicy: 'network-only' }).pipe(
                    map((res: any) => res?.data?.GetBuildings ?? [])
                )
            )
            : this.queryCache.load(
                'admin-classrooms-buildings',
                [RealtimeScope.Buildings],
                () => this.apollo.query<any>({ query: GET_BUILDINGS, fetchPolicy: 'network-only' }).pipe(
                    map((res: any) => res?.data?.GetBuildings ?? [])
                )
            );

        request$.subscribe({
            next: (buildings: any[]) => {
                this.buildings = buildings;
                this.refreshClassroomToolbarFilters();
                this.ApplyFilter();
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error al cargar edificios para aulas:', err);
                this.notifications.danger('Error al cargar edificios para aulas: ' + err.message);
                this.cdr.detectChanges();
            }
        });
    }

    LoadClassrooms(forceRefresh = false) {
        if (forceRefresh) {
            this.isClassroomsLoaded = false;
        }

        const request$ = forceRefresh
            ? this.queryCache.refresh(
                'admin-classrooms-list',
                [RealtimeScope.Classrooms],
                () => this.apollo.query<any>({ query: GET_CLASSROOMS, fetchPolicy: 'network-only' }).pipe(
                    map((res: any) => res?.data?.GetClassrooms ?? [])
                )
            )
            : this.queryCache.load(
                'admin-classrooms-list',
                [RealtimeScope.Classrooms],
                () => this.apollo.query<any>({ query: GET_CLASSROOMS, fetchPolicy: 'network-only' }).pipe(
                    map((res: any) => res?.data?.GetClassrooms ?? [])
                )
            );

        request$.subscribe({
            next: (classrooms: any[]) => {
                this.classrooms = classrooms;
                this.refreshClassroomToolbarFilters();
                this.ApplyFilter();
                this.isClassroomsLoaded = true;
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error al cargar aulas:', err);
                this.notifications.danger('Error al cargar aulas: ' + err.message);
                this.isClassroomsLoaded = true;
                this.cdr.detectChanges();
            }
        });
    }

    OnToolbarChange(state: CatalogToolbarState): void {
        this.catalogToolbarState = state;
        this.ApplyFilter();
    }

    hasClassroomCriteria(): boolean {
        return this.catalogToolbarState.searchQuery.trim().length > 0
            || String(this.catalogToolbarState.filters['buildingId'] ?? '') !== '';
    }

    ApplyFilter(): void {
        this.filteredClassrooms = applyCatalogQuery(this.classrooms, this.catalogToolbarState, {
            searchFields: [
                (classroom: any) => classroom?.name,
                (classroom: any) => classroom?.building?.name,
            ],
            filterPredicates: {
                buildingId: (classroom: any, value: string) => {
                    if (value === '__none__') {
                        return !classroom?.building;
                    }

                    return String(classroom?.building?.id ?? '') === value;
                },
            },
            sortPredicates: {
                buildingThenName: (left: any, right: any) => {
                    const leftBuilding = left?.building?.name ?? '';
                    const rightBuilding = right?.building?.name ?? '';
                    const leftHasBuilding = !!left?.building;
                    const rightHasBuilding = !!right?.building;

                    if (!leftHasBuilding && rightHasBuilding) {
                        return 1;
                    }

                    if (leftHasBuilding && !rightHasBuilding) {
                        return -1;
                    }

                    const buildingComparison = compareCatalogText(leftBuilding, rightBuilding);
                    if (buildingComparison !== 0) {
                        return buildingComparison;
                    }

                    return compareCatalogText(left?.name, right?.name);
                },
                name: (left: any, right: any) => compareCatalogText(left?.name, right?.name),
            },
            defaultSort: 'buildingThenName',
        });
    }

    private refreshClassroomToolbarFilters(): void {
        const hasUnassignedClassrooms = this.classrooms.some((classroom: any) => !classroom?.building);
        const options = [
            { value: '', label: 'Todos' },
            ...this.buildings.map((building: any) => ({
                value: String(building?.id ?? ''),
                label: String(building?.name ?? 'Edificio'),
            })),
        ];

        if (hasUnassignedClassrooms) {
            options.push({ value: '__none__', label: 'Sin edificio' });
        }

        this.classroomToolbarFilters = [
            {
                key: 'buildingId',
                label: 'Edificio',
                placeholder: 'Filtrar por edificio',
                defaultValue: '',
                options,
            },
        ];
    }

    private setupRealtimeRefresh(): void {
        this.realtimeSync.watchScopes([RealtimeScope.Buildings, RealtimeScope.Classrooms])
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                this.LoadBuildings();
                this.LoadClassrooms();
            });
    }

    OpenModal(item: any = null) {
        this.editingItem = item;
        if (item) {
            this.formData = { name: item.name, buildingId: item.building?.id ?? null };
        } else {
            this.formData = { name: '', buildingId: null };
        }
        this.isModalOpen = true;
    }

    Save() {
        if (!this.formData.name || !this.formData.buildingId) return;

        const classroomInput: any = { 
            name: this.formData.name 
        };

        classroomInput.buildingId = Number(this.formData.buildingId);

        if (this.editingItem) {
            this.apollo.mutate({
                mutation: UPDATE_CLASSROOM,
                variables: { 
                    input: { 
                        id: Number(this.editingItem.id),
                        ...classroomInput
                    } 
                }
            }).subscribe({
                next: () => { 
                    this.isModalOpen = false;
                    this.editingItem = null;
                    this.LoadBuildings(true);
                    this.LoadClassrooms(true);
                },
                error: (err) => {
                    console.error('Error al actualizar aula:', err);
                    this.notifications.danger(getGraphQLErrorMessage(err, 'No se pudo guardar el aula.'));
                }
            });
        } else {
            this.apollo.mutate({
                mutation: CREATE_CLASSROOM,
                variables: { input: classroomInput },
            }).subscribe({
                next: () => {
                    this.isModalOpen = false;
                    this.LoadBuildings(true);
                    this.LoadClassrooms(true);
                },
                error: (err) => {
                    console.error('Error al crear aula:', err);
                    this.notifications.danger(getGraphQLErrorMessage(err, 'No se pudo guardar el aula.'));
                }
            });
        }
    }

    async RemoveClassroom(id: number) {
        if (!(await this.notifications.confirm({
            title: 'Eliminar aula',
            message: '¿Seguro que desea eliminar esta aula? Esta acción no se puede deshacer.',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            confirmColor: 'danger',
            styleType: 'danger'
        }))) return;
        this.apollo.mutate({
            mutation: REMOVE_CLASSROOM,
            variables: { id: parseInt(id.toString()) },
        }).subscribe({
            next: () => {
                this.LoadBuildings(true);
                this.LoadClassrooms(true);
            },
            error: (err) => this.notifications.danger(getGraphQLErrorMessage(err, 'No se pudo eliminar el aula.'))
        });
    }
}
