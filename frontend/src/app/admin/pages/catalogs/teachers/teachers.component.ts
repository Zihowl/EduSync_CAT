import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { map } from 'rxjs';
import {
    IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, 
    IonList, IonItem, IonLabel, IonAvatar, 
    IonIcon, IonSearchbar, IonFab, IonFabButton, IonModal, 
    IonInput, IonFooter, IonButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { personOutline, trashOutline, addOutline, pencilOutline, mailOutline, cardOutline } from 'ionicons/icons';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { RealtimeQueryCacheService } from '../../../../core/services/realtime-query-cache.service';
import { RealtimeScope, RealtimeSyncService } from '../../../../core/services/realtime-sync.service';

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
        CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, 
        IonTitle, IonButtons, IonList, IonItem, 
        IonLabel, IonAvatar, IonIcon, IonSearchbar, IonFab, 
        IonFabButton, IonModal, IonInput, IonFooter, IonButton, PageHeaderComponent
    ],
    template: `
        <app-page-header title="Docentes" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding">
            <div class="app-page-shell app-page-shell--medium">
                <div class="app-page-section">
                    <ion-searchbar placeholder="Buscar docente..." (ionInput)="Filter($event)"></ion-searchbar>
                </div>
                <ion-list lines="inset">
                    <ion-item *ngFor="let t of filteredTeachers">
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
                </ion-list>

                <div *ngIf="filteredTeachers.length === 0" class="teacher-empty-state">
                    <ion-icon name="person-outline" class="teacher-empty-icon"></ion-icon>
                    <p>No se encontraron docentes</p>
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
                                <ion-title>{{ editingItem ? 'Editar' : 'Nuevo' }} Docente</ion-title>
                                <ion-buttons slot="end">
                                    <ion-button (click)="isModalOpen = false">Cerrar</ion-button>
                                </ion-buttons>
                            </ion-toolbar>
                        </ion-header>
                        <ion-content class="ion-padding">
                            <ion-list>
                                <ion-item fill="outline" class="teacher-form-item">
                                    <ion-label position="stacked">Nombre completo</ion-label>
                                    <ion-input [(ngModel)]="formData.name" placeholder="Ej. Juan Pérez"></ion-input>
                                    <ion-icon name="person-outline" slot="start"></ion-icon>
                                </ion-item>
                                
                                <ion-item fill="outline" class="teacher-form-item">
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
                        </ion-content>
                        <ion-footer class="ion-padding">
                            <ion-button expand="block" (click)="Save()" [disabled]="!formData.name || !formData.employeeNumber">
                                {{ editingItem ? 'Actualizar' : 'Guardar' }}
                            </ion-button>
                        </ion-footer>
                    </ng-template>
                </ion-modal>
            </div>
        </ion-content>
    `,
    styleUrls: ['./teachers.component.scss']
})
export class TeachersComponent implements OnInit
{
    private apollo = inject(Apollo);
    private queryCache = inject(RealtimeQueryCacheService);
    private realtimeSync = inject(RealtimeSyncService);
    private destroyRef = inject(DestroyRef);

    teachers: any[] = [];
    filteredTeachers: any[] = [];
    searchQuery: string = '';
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

    LoadTeachers() {
        this.queryCache.load(
            'admin-teachers',
            [RealtimeScope.Teachers],
            () => this.apollo.query<any>({ query: GET_TEACHERS, fetchPolicy: 'network-only' }).pipe(
                map((res: any) => res?.data?.GetTeachers ?? [])
            )
        ).subscribe({
            next: (teachers: any[]) => {
                this.teachers = teachers;
                this.ApplyFilter();
            },
            error: (err) => {
                console.error('Error loading teachers:', err);
            }
        });
    }

    Filter(event: any) {
        this.searchQuery = event.detail.value?.toLowerCase() || '';
        this.ApplyFilter();
    }

    ApplyFilter() {
        if (!this.searchQuery) {
            this.filteredTeachers = [...this.teachers];
            return;
        }

        this.filteredTeachers = this.teachers.filter(t => 
            t.name.toLowerCase().includes(this.searchQuery) || 
            t.employeeNumber.toLowerCase().includes(this.searchQuery)
        );
    }

    private setupRealtimeRefresh(): void {
        this.realtimeSync.watchScopes([RealtimeScope.Teachers])
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.LoadTeachers());
    }

    GetInitials(name: string): string {
        return name
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
                alert('Por favor, ingresa un correo electrónico válido (ej. usuario@dominio.com)');
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
                    this.LoadTeachers();
                },
                error: (err) => {
                    console.error('Update teacher error:', err);
                    alert('Error al actualizar: ' + (err.message || 'Error desconocido'));
                }
            });
        } else {
            this.apollo.mutate({
                mutation: CREATE_TEACHER,
                variables: { input: teacherInput },
            }).subscribe({
                next: () => { 
                    this.isModalOpen = false; 
                    this.LoadTeachers();
                },
                error: (err) => {
                    console.error('Create teacher error:', err);
                    alert('Error al crear: ' + (err.message || 'Error desconocido'));
                }
            });
        }
    }

    RemoveTeacher(id: number) {
        if (!confirm('¿Seguro que desea eliminar este docente?')) return;
        this.apollo.mutate({
            mutation: REMOVE_TEACHER,
            variables: { id: parseInt(id.toString()) },
        }).subscribe({
            next: () => this.LoadTeachers(),
            error: (err) => alert('Error al eliminar: ' + err.message)
        });
    }
}
