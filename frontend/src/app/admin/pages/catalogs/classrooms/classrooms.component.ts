import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { 
    IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, 
    IonList, IonItem, IonLabel, IonSelect, 
    IonSelectOption, IonButton, IonIcon, IonFab, IonFabButton, 
    IonModal, IonInput, IonFooter
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trashOutline, addOutline, pencilOutline, homeOutline } from 'ionicons/icons';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';

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
        IonFab, IonFabButton, IonModal, IonInput, IonFooter, PageHeaderComponent
    ],
    template: `
        <app-page-header title="Aulas" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content>
            <ion-list lines="inset">
                <ion-item *ngFor="let c of classrooms">
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
            </ion-list>

            <div *ngIf="classrooms.length === 0" class="classroom-empty-state">
                <ion-icon name="home-outline" class="classroom-empty-icon"></ion-icon>
                <p>No hay aulas registradas</p>
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
        </ion-content>
    `,
    styleUrls: ['./classrooms.component.scss']
})
export class ClassroomsComponent implements OnInit
{
    private apollo = inject(Apollo);

    classrooms: any[] = [];
    buildings: any[] = [];
    isModalOpen = false;
    editingItem: any = null;
    formData = {
        name: '',
        buildingId: null as number | null
    };

    ngOnInit() {
        addIcons({ trashOutline, addOutline, pencilOutline, homeOutline });
        this.LoadBuildings();
        this.LoadClassrooms();
    }

    LoadBuildings() {
        this.apollo.watchQuery<any>({ query: GET_BUILDINGS, fetchPolicy: 'network-only' }).valueChanges.subscribe({
            next: (res: any) => {
                this.buildings = res?.data?.GetBuildings ?? [];
            }
        });
    }

    LoadClassrooms() {
        this.apollo.watchQuery<any>({ query: GET_CLASSROOMS, fetchPolicy: 'network-only' }).valueChanges.subscribe({
            next: (res: any) => {
                this.classrooms = res?.data?.GetClassrooms ?? [];
            }
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
                },
                refetchQueries: [{ query: GET_CLASSROOMS }]
            }).subscribe({
                next: () => { 
                    this.isModalOpen = false;
                    this.editingItem = null;
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
                refetchQueries: [{ query: GET_CLASSROOMS }]
            }).subscribe({
                next: () => { this.isModalOpen = false; },
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
            refetchQueries: [{ query: GET_CLASSROOMS }]
        }).subscribe({
            error: (err) => alert('Error al eliminar: ' + err.message)
        });
    }
}
