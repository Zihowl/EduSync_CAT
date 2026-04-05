import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { map } from 'rxjs';
import { 
    IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, 
    IonList, IonItem, IonLabel, IonSelect, 
    IonSelectOption, IonButton, IonIcon, IonFab, IonFabButton, 
    IonModal, IonInput, IonFooter
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trashOutline, addOutline, pencilOutline, homeOutline } from 'ionicons/icons';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { DataListComponent } from '../../../../shared/components/data-list/data-list.component';
import { RealtimeQueryCacheService } from '../../../../core/services/realtime-query-cache.service';
import { RealtimeScope, RealtimeSyncService } from '../../../../core/services/realtime-sync.service';

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
        CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, 
        IonTitle, IonButtons, IonList, IonItem, 
        IonLabel, IonSelect, IonSelectOption, IonButton, IonIcon, 
        IonFab, IonFabButton, IonModal, IonInput, IonFooter, PageHeaderComponent, DataListComponent
    ],
    template: `
        <app-page-header title="Aulas" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding">
            <div class="app-page-shell app-page-shell--medium">
                <app-data-list
                    [items]="classrooms"
                    [loaded]="isClassroomsLoaded"
                    loadingText="Cargando aulas..."
                    emptyIcon="home-outline"
                    emptyTitle="No hay aulas registradas"
                    emptySubtitle="Agrega la primera aula con el botón +">
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

                <ion-modal [isOpen]="isModalOpen" (didDismiss)="isModalOpen = false">
                    <ng-template>
                        <ion-header>
                            <ion-toolbar color="primary">
                                <ion-title>{{ editingItem ? 'Editar' : 'Nueva' }} Aula</ion-title>
                                <ion-buttons slot="end">
                                    <ion-button (click)="isModalOpen = false">Cerrar</ion-button>
                                </ion-buttons>
                            </ion-toolbar>
                        </ion-header>
                        <ion-content class="ion-padding">
                            <ion-list>
                                <ion-item fill="outline" class="classroom-form-item">
                                    <ion-label position="stacked">Nombre del aula / Salón</ion-label>
                                    <ion-input [(ngModel)]="formData.name" placeholder="Ej. Laboratorio 1"></ion-input>
                                </ion-item>
                                
                                <ion-item fill="outline">
                                    <ion-label position="stacked">Edificio al que pertenece</ion-label>
                                    <ion-select interface="popover" [(ngModel)]="formData.buildingId" placeholder="Seleccionar edificio">
                                        <ion-select-option [value]="null">Sin edificio</ion-select-option>
                                        <ion-select-option *ngFor="let b of buildings" [value]="b.id">
                                            {{ b.name }}
                                        </ion-select-option>
                                    </ion-select>
                                </ion-item>
                            </ion-list>
                        </ion-content>
                        <ion-footer class="ion-padding">
                            <ion-button expand="block" (click)="Save()" [disabled]="!formData.name">
                                {{ editingItem ? 'Actualizar' : 'Guardar' }}
                            </ion-button>
                        </ion-footer>
                    </ng-template>
                </ion-modal>
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

    classrooms: any[] = [];
    buildings: any[] = [];
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

    LoadBuildings() {
        this.queryCache.load(
            'admin-classrooms-buildings',
            [RealtimeScope.Buildings],
            () => this.apollo.query<any>({ query: GET_BUILDINGS, fetchPolicy: 'network-only' }).pipe(
                map((res: any) => res?.data?.GetBuildings ?? [])
            )
        ).subscribe({
            next: (buildings: any[]) => {
                this.buildings = buildings;
            }
        });
    }

    LoadClassrooms() {
        this.queryCache.load(
            'admin-classrooms-list',
            [RealtimeScope.Classrooms],
            () => this.apollo.query<any>({ query: GET_CLASSROOMS, fetchPolicy: 'network-only' }).pipe(
                map((res: any) => res?.data?.GetClassrooms ?? [])
            )
        ).subscribe({
            next: (classrooms: any[]) => {
                this.classrooms = classrooms;
                this.isClassroomsLoaded = true;
            },
            error: (err) => {
                console.error('Error loading classrooms:', err);
                this.isClassroomsLoaded = true;
            }
        });
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
        if (!this.formData.name) return;

        const classroomInput: any = { 
            name: this.formData.name 
        };

        if (this.formData.buildingId) {
            classroomInput.buildingId = Number(this.formData.buildingId);
        } else {
            classroomInput.buildingId = null;
        }

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
                    this.LoadBuildings();
                    this.LoadClassrooms();
                },
                error: (err) => {
                    console.error('Update classroom error:', err);
                    alert('Error al actualizar: ' + err.message);
                }
            });
        } else {
            this.apollo.mutate({
                mutation: CREATE_CLASSROOM,
                variables: { input: classroomInput },
            }).subscribe({
                next: () => {
                    this.isModalOpen = false;
                    this.LoadBuildings();
                    this.LoadClassrooms();
                },
                error: (err) => {
                    console.error('Create classroom error:', err);
                    alert('Error al crear: ' + err.message);
                }
            });
        }
    }

    RemoveClassroom(id: number) {
        if (!confirm('¿Seguro que desea eliminar esta aula? Esta acción no se puede deshacer.')) return;
        this.apollo.mutate({
            mutation: REMOVE_CLASSROOM,
            variables: { id: parseInt(id.toString()) },
        }).subscribe({
            next: () => {
                this.LoadBuildings();
                this.LoadClassrooms();
            },
            error: (err) => alert('Error al eliminar: ' + err.message)
        });
    }
}
