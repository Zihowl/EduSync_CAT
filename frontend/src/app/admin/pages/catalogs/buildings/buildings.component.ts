import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { 
    IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, 
    IonList, IonItem, IonLabel, IonButton, 
    IonIcon, IonFab, IonFabButton, IonModal, IonInput, 
    IonTextarea, IonFooter
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trashOutline, addOutline, pencilOutline, businessOutline } from 'ionicons/icons';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';

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
        CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, 
        IonTitle, IonButtons, IonList, IonItem, 
        IonLabel, IonButton, IonIcon, IonFab, IonFabButton, 
        IonModal, IonInput, IonTextarea, IonFooter, PageHeaderComponent
    ],
    template: `
        <app-page-header title="Edificios" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content>
            <ion-list lines="inset">
                <ion-item *ngFor="let b of buildings">
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
            </ion-list>

            <div *ngIf="buildings.length === 0" class="building-empty-state">
                <ion-icon name="business-outline" class="building-empty-icon"></ion-icon>
                <p>No hay edificios registrados</p>
            </div>

            <ion-fab vertical="bottom" horizontal="end" slot="fixed">
                <ion-fab-button (click)="OpenModal()">
                    <ion-icon name="add-outline"></ion-icon>
                </ion-fab-button>
            </ion-fab>

            <ion-modal [isOpen]="isModalOpen" (didDismiss)="isModalOpen = false">
                <ng-template>
                    <ion-header>
                        <ion-toolbar color="primary">
                            <ion-title>{{ editingItem ? 'Editar' : 'Nuevo' }} Edificio</ion-title>
                            <ion-buttons slot="end">
                                <ion-button (click)="isModalOpen = false">Cerrar</ion-button>
                            </ion-buttons>
                        </ion-toolbar>
                    </ion-header>
                    <ion-content class="ion-padding">
                        <ion-list>
                            <ion-item fill="outline" class="building-form-item">
                                <ion-label position="stacked">Nombre del edificio</ion-label>
                                <ion-input [(ngModel)]="formData.name" placeholder="Ej. Edificio A"></ion-input>
                            </ion-item>
                            
                            <ion-item fill="outline">
                                <ion-label position="stacked">Descripción (opcional)</ion-label>
                                <ion-textarea [(ngModel)]="formData.description" placeholder="Detalles adicionales..." [rows]="4"></ion-textarea>
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
        </ion-content>
    `,
    styleUrls: ['./buildings.component.scss']
})
export class BuildingsComponent implements OnInit
{
    private apollo = inject(Apollo);

    buildings: any[] = [];
    isModalOpen = false;
    editingItem: any = null;
    formData = {
        name: '',
        description: ''
    };

    ngOnInit() {
        addIcons({ trashOutline, addOutline, pencilOutline, businessOutline });
        this.LoadBuildings();
    }

    LoadBuildings() {
        this.apollo.watchQuery<any>({ query: GET_BUILDINGS, fetchPolicy: 'network-only' }).valueChanges.subscribe({
            next: (res: any) => {
                this.buildings = res?.data?.GetBuildings ?? [];
            },
            error: (err) => {
                console.error('Error loading buildings:', err);
            }
        });
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
                },
                refetchQueries: [{ query: GET_BUILDINGS }]
            }).subscribe({
                next: () => { 
                    this.isModalOpen = false;
                    this.editingItem = null;
                },
                error: (err) => {
                    console.error('Update building error:', err);
                    alert('Error al actualizar: ' + err.message);
                }
            });
        } else {
            this.apollo.mutate({
                mutation: CREATE_BUILDING,
                variables: { input: buildingInput },
                refetchQueries: [{ query: GET_BUILDINGS }]
            }).subscribe({
                next: () => { this.isModalOpen = false; },
                error: (err) => {
                    console.error('Create building error:', err);
                    alert('Error al crear: ' + err.message);
                }
            });
        }
    }

    RemoveBuilding(id: number) {
        if (!confirm('¿Seguro que desea eliminar este edificio? Esta acción no se puede deshacer.')) return;
        this.apollo.mutate({
            mutation: REMOVE_BUILDING,
            variables: { id: parseInt(id.toString()) },
            refetchQueries: [{ query: GET_BUILDINGS }]
        }).subscribe({
            error: (err) => alert('Error al eliminar: ' + err.message)
        });
    }
}
