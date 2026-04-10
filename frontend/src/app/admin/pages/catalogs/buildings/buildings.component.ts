import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { map } from 'rxjs';
import { 
    IonContent, IonList, IonItem, IonButtons, IonLabel, IonButton,
    IonIcon, IonFab, IonFabButton, IonInput,
    IonTextarea
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trashOutline, addOutline, pencilOutline, businessOutline } from 'ionicons/icons';
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

const GET_BUILDINGS = gql`
    query GetBuildings {
        GetBuildings {
            id
            name
            description
        }
    }
`;

const CREATE_BUILDING = gql`
    mutation CreateBuilding($input: CreateBuildingInput!) {
        CreateBuilding(input: $input) {
            id
            name
        }
    }
`;

const UPDATE_BUILDING = gql`
    mutation UpdateBuilding($input: UpdateBuildingInput!) {
        UpdateBuilding(input: $input) {
            id
            name
            description
        }
    }
`;

const REMOVE_BUILDING = gql`
    mutation RemoveBuilding($id: Int!) {
        RemoveBuilding(id: $id)
    }
`;

@Component({
    selector: 'app-buildings',
    standalone: true,
    imports: [
        CommonModule, FormsModule, IonContent, IonList, IonItem,
        IonLabel, IonButtons, IonButton, IonIcon, IonFab, IonFabButton,
        IonInput, IonTextarea, PageHeaderComponent, DataListComponent, ModalComponent, CatalogToolbarComponent
    ],
    template: `
        <app-page-header title="Edificios" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding">
            <div class="app-page-shell app-page-shell--medium">
                <div class="app-page-section">
                    <app-catalog-toolbar
                        [state]="catalogToolbarState"
                        [sortOptions]="buildingSortOptions"
                        searchPlaceholder="Buscar edificio..."
                        sortPlaceholder="Ordenar edificios"
                        clearLabel="Restablecer"
                        (stateChange)="OnToolbarChange($event)">
                    </app-catalog-toolbar>
                </div>
                <app-data-list
                    [items]="filteredBuildings"
                    [loaded]="isBuildingsLoaded"
                    loadingText="Cargando edificios..."
                    emptyIcon="business-outline"
                    [emptyTitle]="catalogToolbarState.searchQuery.trim() ? 'No se encontraron edificios' : 'No hay edificios registrados'"
                    [emptySubtitle]="catalogToolbarState.searchQuery.trim() ? 'Prueba con otro nombre o descripción' : 'Agrega el primer edificio con el botón +'">
                    <ng-template #itemTemplate let-b>
                        <ion-item>
                            <ion-icon name="business-outline" slot="start" color="primary"></ion-icon>
                            <ion-label>
                                <h2 class="building-name">{{ b.name }}</h2>
                                <p>{{ b.description || 'Sin descripción' }}</p>
                            </ion-label>
                            <ion-buttons slot="end">
                                <ion-button color="medium" (click)="OpenModal(b)">
                                    <ion-icon name="pencil-outline" slot="icon-only"></ion-icon>
                                </ion-button>
                                <ion-button color="danger" (click)="RemoveBuilding(b.id)">
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
                    [title]="(editingItem ? 'Editar' : 'Nuevo') + ' Edificio'"
                    subtitle="Captura el nombre y una descripción opcional."
                    [saveLabel]="editingItem ? 'Actualizar' : 'Guardar'"
                    [saveDisabled]="!formData.name"
                    (save)="Save()">
                    <ng-template #modalBody>
                        <ion-list>
                            <ion-item fill="outline">
                                <ion-label position="stacked">Nombre del edificio</ion-label>
                                <ion-input [(ngModel)]="formData.name" placeholder="Ej. Edificio A"></ion-input>
                            </ion-item>

                            <ion-item fill="outline">
                                <ion-label position="stacked">Descripción (opcional)</ion-label>
                                <ion-textarea [(ngModel)]="formData.description" placeholder="Detalles adicionales..." [rows]="4"></ion-textarea>
                            </ion-item>
                        </ion-list>
                    </ng-template>
                </app-modal>
            </div>
        </ion-content>
    `,
    styleUrls: ['./buildings.component.scss']
})
export class BuildingsComponent implements OnInit
{
    private apollo = inject(Apollo);
    private queryCache = inject(RealtimeQueryCacheService);
    private realtimeSync = inject(RealtimeSyncService);
    private destroyRef = inject(DestroyRef);
    private cdr = inject(ChangeDetectorRef);
    private notifications = inject(NotificationService);

    buildings: any[] = [];
    filteredBuildings: any[] = [];
    catalogToolbarState: CatalogToolbarState = {
        searchQuery: '',
        sortValue: 'name',
        filters: {},
    };
    readonly buildingSortOptions = [
        { value: 'name', label: 'Nombre' },
        { value: 'description', label: 'Descripción' },
    ];
    isBuildingsLoaded = false;
    isModalOpen = false;
    editingItem: any = null;
    formData = {
        name: '',
        description: ''
    };

    ngOnInit() {
        addIcons({ trashOutline, addOutline, pencilOutline, businessOutline });
        this.setupRealtimeRefresh();
    }

    ionViewWillEnter(): void {
        this.LoadBuildings();
    }

    ionViewWillLeave(): void {
        this.isBuildingsLoaded = true;
        this.cdr.detectChanges();
    }

    LoadBuildings(forceRefresh = false) {
        const request$ = forceRefresh
            ? this.queryCache.refresh(
                'admin-buildings',
                [RealtimeScope.Buildings],
                () => this.apollo.query<any>({ query: GET_BUILDINGS, fetchPolicy: 'network-only' }).pipe(
                    map((res: any) => res?.data?.GetBuildings ?? [])
                )
            )
            : this.queryCache.load(
                'admin-buildings',
                [RealtimeScope.Buildings],
                () => this.apollo.query<any>({ query: GET_BUILDINGS, fetchPolicy: 'network-only' }).pipe(
                    map((res: any) => res?.data?.GetBuildings ?? [])
                )
            );

        request$.subscribe({
            next: (buildings: any[]) => {
                this.buildings = buildings;
                this.ApplyFilter();
                this.isBuildingsLoaded = true;
                this.cdr.detectChanges();
            },
            error: (err: any) => {
                console.error('Error al cargar edificios:', err);
                this.notifications.danger('Error al cargar edificios: ' + err.message);
                this.isBuildingsLoaded = true;
                this.cdr.detectChanges();
            }
        });
    }

    OnToolbarChange(state: CatalogToolbarState): void {
        this.catalogToolbarState = state;
        this.ApplyFilter();
    }

    ApplyFilter(): void {
        this.filteredBuildings = applyCatalogQuery(this.buildings, this.catalogToolbarState, {
            searchFields: [
                (building: any) => building?.name,
                (building: any) => building?.description,
            ],
            sortPredicates: {
                name: (left: any, right: any) => compareCatalogText(left?.name, right?.name),
                description: (left: any, right: any) => compareCatalogText(left?.description, right?.description),
            },
            defaultSort: 'name',
        });
    }

    private setupRealtimeRefresh(): void {
        this.realtimeSync.watchScopes([RealtimeScope.Buildings])
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.LoadBuildings());
    }

    OpenModal(item: any = null) {
        this.editingItem = item;
        if (item) {
            this.formData = { name: item.name, description: item.description };
        } else {
            this.formData = { name: '', description: '' };
        }
        this.isModalOpen = true;
    }

    Save() {
        if (!this.formData.name) return;

        const buildingInput = {
            name: this.formData.name,
            description: this.formData.description || null
        };

        if (this.editingItem) {
            this.apollo.mutate({
                mutation: UPDATE_BUILDING,
                variables: { 
                    input: { 
                        id: Number(this.editingItem.id), 
                        ...buildingInput
                    } 
                }
            }).subscribe({
                next: () => { 
                    this.isModalOpen = false;
                    this.editingItem = null;
                    this.LoadBuildings(true);
                },
                error: (err) => {
                    console.error('Error al actualizar edificio:', err);
                    this.notifications.danger(getGraphQLErrorMessage(err, 'No se pudo guardar el edificio.'));
                }
            });
        } else {
            this.apollo.mutate({
                mutation: CREATE_BUILDING,
                variables: { input: buildingInput },
            }).subscribe({
                next: () => {
                    this.isModalOpen = false;
                    this.LoadBuildings(true);
                },
                error: (err) => {
                    console.error('Error al crear edificio:', err);
                    this.notifications.danger(getGraphQLErrorMessage(err, 'No se pudo guardar el edificio.'));
                }
            });
        }
    }

    async RemoveBuilding(id: number) {
        if (!(await this.notifications.confirm({
            title: 'Eliminar edificio',
            message: '¿Seguro que desea eliminar este edificio? Esta acción no se puede deshacer.',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            confirmColor: 'danger',
            styleType: 'danger'
        }))) return;
        this.apollo.mutate({
            mutation: REMOVE_BUILDING,
            variables: { id: parseInt(id.toString()) },
        }).subscribe({
            next: () => this.LoadBuildings(true),
            error: (err) => this.notifications.danger(getGraphQLErrorMessage(err, 'No se pudo eliminar el edificio.'))
        });
    }
}
