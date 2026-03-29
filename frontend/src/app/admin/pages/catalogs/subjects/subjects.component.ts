import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { 
    IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, 
    IonBackButton, IonList, IonItem, IonLabel, IonButton, 
    IonIcon, IonFab, IonFabButton, IonModal, IonInput, 
    IonFooter
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trashOutline, addOutline, pencilOutline, bookOutline } from 'ionicons/icons';

const GET_SUBJECTS = gql`
    query GetSubjects {
        GetSubjects {
            id
            code
            name
        }
    }
`;

const CREATE_SUBJECT = gql`
    mutation CreateSubject($input: CreateSubjectInput!) {
        CreateSubject(input: $input) {
            id
            name
        }
    }
`;

const UPDATE_SUBJECT = gql`
    mutation UpdateSubject($input: UpdateSubjectInput!) {
        UpdateSubject(input: $input) {
            id
            code
            name
        }
    }
`;

const REMOVE_SUBJECT = gql`
    mutation RemoveSubject($id: Int!) {
        RemoveSubject(id: $id)
    }
`;

@Component({
    selector: 'app-subjects',
    standalone: true,
    imports: [
        CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, 
        IonTitle, IonButtons, IonBackButton, IonList, IonItem, 
        IonLabel, IonButton, IonIcon, IonFab, IonFabButton, 
        IonModal, IonInput, IonFooter
    ],
    template: `
        <ion-header>
            <ion-toolbar color="primary">
                <ion-buttons slot="start">
                    <ion-back-button defaultHref="/admin"></ion-back-button>
                </ion-buttons>
                <ion-title>Materias</ion-title>
            </ion-toolbar>
        </ion-header>

        <ion-content>
            <ion-list lines="inset">
                <ion-item *ngFor="let s of subjects">
                    <ion-icon name="book-outline" slot="start" color="primary"></ion-icon>
                    <ion-label>
                        <h2 class="fw-bold">{{ s.name }}</h2>
                        <p>Clave: {{ s.code }}</p>
                    </ion-label>
                    <ion-buttons slot="end">
                        <ion-button color="medium" (click)="OpenModal(s)">
                            <ion-icon name="pencil-outline" slot="icon-only"></ion-icon>
                        </ion-button>
                        <ion-button color="danger" (click)="RemoveSubject(s.id)">
                            <ion-icon name="trash-outline" slot="icon-only"></ion-icon>
                        </ion-button>
                    </ion-buttons>
                </ion-item>
            </ion-list>

            <div *ngIf="subjects.length === 0" class="ion-text-center ion-padding mt-5 opacity-50">
                <ion-icon name="book-outline" style="font-size: 64px;"></ion-icon>
                <p>No hay materias registradas</p>
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
                            <ion-title>{{ editingItem ? 'Editar' : 'Nueva' }} Materia</ion-title>
                            <ion-buttons slot="end">
                                <ion-button (click)="isModalOpen = false">Cerrar</ion-button>
                            </ion-buttons>
                        </ion-toolbar>
                    </ion-header>
                    <ion-content class="ion-padding">
                        <ion-list>
                            <ion-item fill="outline" class="mb-3">
                                <ion-label position="stacked">Clave de la materia</ion-label>
                                <ion-input [(ngModel)]="formData.code" placeholder="Ej. MAT101"></ion-input>
                            </ion-item>
                            
                            <ion-item fill="outline">
                                <ion-label position="stacked">Nombre de la materia</ion-label>
                                <ion-input [(ngModel)]="formData.name" placeholder="Ej. Matemáticas I"></ion-input>
                            </ion-item>
                        </ion-list>
                    </ion-content>
                    <ion-footer class="ion-padding">
                        <ion-button expand="block" (click)="Save()" [disabled]="!formData.code || !formData.name">
                            {{ editingItem ? 'Actualizar' : 'Guardar' }}
                        </ion-button>
                    </ion-footer>
                </ng-template>
            </ion-modal>
        </ion-content>
    `,
    styles: [`
        ion-item { --padding-start: 16px; }
        .mb-3 { margin-bottom: 1rem; }
    `]
})
export class SubjectsComponent implements OnInit
{
    private apollo = inject(Apollo);

    subjects: any[] = [];
    isModalOpen = false;
    editingItem: any = null;
    formData = {
        code: '',
        name: ''
    };

    ngOnInit() {
        addIcons({ trashOutline, addOutline, pencilOutline, bookOutline });
        this.LoadSubjects();
    }

    LoadSubjects() {
        this.apollo.watchQuery<any>({ query: GET_SUBJECTS, fetchPolicy: 'network-only' }).valueChanges.subscribe({
            next: (res: any) => {
                this.subjects = res?.data?.GetSubjects ?? [];
            },
            error: (err) => {
                console.error('Error loading subjects:', err);
            }
        });
    }

    OpenModal(item: any = null) {
        this.editingItem = item;
        if (item) {
            this.formData = { code: item.code, name: item.name };
        } else {
            this.formData = { code: '', name: '' };
        }
        this.isModalOpen = true;
    }

    Save() {
        if (!this.formData.code || !this.formData.name) return;

        const subjectInput = {
            code: this.formData.code,
            name: this.formData.name
        };

        if (this.editingItem) {
            this.apollo.mutate({
                mutation: UPDATE_SUBJECT,
                variables: { 
                    input: { 
                        id: Number(this.editingItem.id), 
                        ...subjectInput 
                    } 
                },
                refetchQueries: [{ query: GET_SUBJECTS }]
            }).subscribe({
                next: () => { 
                    this.isModalOpen = false;
                    this.editingItem = null;
                },
                error: (err) => {
                    console.error('Update subject error:', err);
                    alert('Error al actualizar: ' + err.message);
                }
            });
        } else {
            this.apollo.mutate({
                mutation: CREATE_SUBJECT,
                variables: { input: subjectInput },
                refetchQueries: [{ query: GET_SUBJECTS }]
            }).subscribe({
                next: () => { this.isModalOpen = false; },
                error: (err) => {
                    console.error('Create subject error:', err);
                    alert('Error al crear: ' + err.message);
                }
            });
        }
    }

    RemoveSubject(id: number) {
        if (!confirm('¿Seguro que desea eliminar esta materia? Esta acción no se puede deshacer.')) return;
        this.apollo.mutate({
            mutation: REMOVE_SUBJECT,
            variables: { id: parseInt(id.toString()) },
            refetchQueries: [{ query: GET_SUBJECTS }]
        }).subscribe({
            error: (err) => alert('Error al eliminar: ' + err.message)
        });
    }
}
