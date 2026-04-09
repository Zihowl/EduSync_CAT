import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { map } from 'rxjs';
import {
    IonContent, IonList, IonItem, IonButtons, IonLabel, IonButton,
    IonIcon, IonFab, IonFabButton, IonInput
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trashOutline, addOutline, pencilOutline, bookOutline } from 'ionicons/icons';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { DataListComponent } from '../../../../shared/components/data-list/data-list.component';
import { CatalogFormModalComponent } from '../../../../shared/components/catalog-form-modal/catalog-form-modal.component';
import { NotificationService } from '../../../../shared/services/notification.service';
import { getGraphQLErrorMessage } from '../../../../shared/utils/graphql-error';
import { RealtimeQueryCacheService } from '../../../../core/services/realtime-query-cache.service';
import { RealtimeScope, RealtimeSyncService } from '../../../../core/services/realtime-sync.service';

const GET_SUBJECTS = gql`
    query GetSubjects {
        GetSubjects {
            id
            code
            name
            grade
        }
    }
`;

const CREATE_SUBJECT = gql`
    mutation CreateSubject($input: CreateSubjectInput!) {
        CreateSubject(input: $input) {
            id
            code
            name
            grade
        }
    }
`;

const UPDATE_SUBJECT = gql`
    mutation UpdateSubject($input: UpdateSubjectInput!) {
        UpdateSubject(input: $input) {
            id
            code
            name
            grade
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
        CommonModule, FormsModule, IonContent, IonList, IonItem,
        IonLabel, IonButtons, IonButton, IonIcon, IonFab, IonFabButton,
        IonInput, PageHeaderComponent, DataListComponent, CatalogFormModalComponent
    ],
    template: `
        <app-page-header title="Materias" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding">
            <div class="app-page-shell app-page-shell--medium">
                <app-data-list
                    [items]="subjects"
                    [loaded]="isSubjectsLoaded"
                    loadingText="Cargando materias..."
                    emptyIcon="book-outline"
                    emptyTitle="No hay materias registradas"
                    emptySubtitle="Agrega la primera materia con el botón +">
                    <ng-template #itemTemplate let-s>
                        <ion-item>
                            <ion-icon name="book-outline" slot="start" color="primary"></ion-icon>
                            <ion-label>
                                <h2 class="subject-name">{{ s.name }}</h2>
                                <p>Clave: {{ s.code }}</p>
                                <p *ngIf="s.grade !== null && s.grade !== undefined">Grado: {{ s.grade }}</p>
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
                    </ng-template>
                </app-data-list>

                <ion-fab vertical="bottom" horizontal="end" slot="fixed">
                    <ion-fab-button (click)="OpenModal()">
                        <ion-icon name="add-outline"></ion-icon>
                    </ion-fab-button>
                </ion-fab>

                <app-public-modal
                    [(isOpen)]="isModalOpen"
                    [title]="(editingItem ? 'Editar' : 'Nueva') + ' Materia'"
                    subtitle="Define la clave, el nombre y el grado opcional de la materia."
                    [saveLabel]="editingItem ? 'Actualizar' : 'Guardar'"
                    [saveDisabled]="!formData.code || !formData.name"
                    (save)="Save()">
                    <ng-template #catalogFormBody>
                        <ion-list>
                            <ion-item fill="outline">
                                <ion-label position="stacked">Clave de la materia</ion-label>
                                <ion-input [(ngModel)]="formData.code" placeholder="Ej. MAT101"></ion-input>
                            </ion-item>

                            <ion-item fill="outline">
                                <ion-label position="stacked">Nombre de la materia</ion-label>
                                <ion-input [(ngModel)]="formData.name" placeholder="Ej. Matemáticas I"></ion-input>
                            </ion-item>

                            <ion-item fill="outline">
                                <ion-label position="stacked">Grado (opcional)</ion-label>
                                <ion-input [(ngModel)]="formData.grade" type="number" inputmode="numeric" min="1" step="1" placeholder="Ej. 2"></ion-input>
                            </ion-item>
                        </ion-list>
                    </ng-template>
                </app-public-modal>
            </div>
        </ion-content>
    `,
    styleUrls: ['./subjects.component.scss']
})
export class SubjectsComponent implements OnInit
{
    private apollo = inject(Apollo);
    private queryCache = inject(RealtimeQueryCacheService);
    private realtimeSync = inject(RealtimeSyncService);
    private destroyRef = inject(DestroyRef);
    private cdr = inject(ChangeDetectorRef);
    private notifications = inject(NotificationService);

    subjects: any[] = [];
    isSubjectsLoaded = false;
    isModalOpen = false;
    editingItem: any = null;
    formData = {
        code: '',
        name: '',
        grade: null as number | null
    };

    ngOnInit() {
        addIcons({ trashOutline, addOutline, pencilOutline, bookOutline });
        this.setupRealtimeRefresh();
    }

    ionViewWillEnter(): void {
        this.LoadSubjects();
    }

    LoadSubjects(forceRefresh = false) {
        if (forceRefresh) {
            this.isSubjectsLoaded = false;
        }

        const request$ = forceRefresh
            ? this.queryCache.refresh(
                'admin-subjects',
                [RealtimeScope.Subjects],
                () => this.apollo.query<any>({ query: GET_SUBJECTS, fetchPolicy: 'network-only' }).pipe(
                    map((res: any) => res?.data?.GetSubjects ?? [])
                )
            )
            : this.queryCache.load(
                'admin-subjects',
                [RealtimeScope.Subjects],
                () => this.apollo.query<any>({ query: GET_SUBJECTS, fetchPolicy: 'network-only' }).pipe(
                    map((res: any) => res?.data?.GetSubjects ?? [])
                )
            );

        request$.subscribe({
            next: (res: any) => {
                this.subjects = res ?? [];
                this.isSubjectsLoaded = true;
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error al cargar materias:', err);
                this.notifications.danger('Error al cargar materias: ' + err.message);
                this.isSubjectsLoaded = true;
                this.cdr.detectChanges();
            }
        });
    }

    private setupRealtimeRefresh(): void {
        this.realtimeSync.watchScopes([RealtimeScope.Subjects])
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.LoadSubjects());
    }

    OpenModal(item: any = null) {
        this.editingItem = item;
        if (item) {
            this.formData = { code: item.code, name: item.name, grade: item.grade ?? null };
        } else {
            this.formData = { code: '', name: '', grade: null };
        }
        this.isModalOpen = true;
    }

    Save() {
        if (!this.formData.code || !this.formData.name) return;

        const rawGrade: number | string | null = this.formData.grade as number | string | null;
        const grade = rawGrade == null || rawGrade === ''
            ? null
            : Number(rawGrade);

        const subjectInput = {
            code: this.formData.code,
            name: this.formData.name,
            grade
        };

        if (this.editingItem) {
            this.apollo.mutate({
                mutation: UPDATE_SUBJECT,
                variables: { 
                    input: { 
                        id: Number(this.editingItem.id), 
                        ...subjectInput 
                    } 
                }
            }).subscribe({
                next: () => { 
                    this.isModalOpen = false;
                    this.editingItem = null;
                    this.LoadSubjects(true);
                },
                error: (err) => {
                    console.error('Error al actualizar materia:', err);
                    this.notifications.danger(getGraphQLErrorMessage(err, 'No se pudo guardar la materia.'));
                }
            });
        } else {
            this.apollo.mutate({
                mutation: CREATE_SUBJECT,
                variables: { input: subjectInput },
            }).subscribe({
                next: () => {
                    this.isModalOpen = false;
                    this.LoadSubjects(true);
                },
                error: (err) => {
                    console.error('Error al crear materia:', err);
                    this.notifications.danger(getGraphQLErrorMessage(err, 'No se pudo guardar la materia.'));
                }
            });
        }
    }

    async RemoveSubject(id: number) {
        if (!(await this.notifications.confirm({
            title: 'Eliminar materia',
            message: '¿Seguro que desea eliminar esta materia? Esta acción no se puede deshacer.',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            confirmColor: 'danger',
            styleType: 'danger'
        }))) return;
        this.apollo.mutate({
            mutation: REMOVE_SUBJECT,
            variables: { id: parseInt(id.toString()) },
        }).subscribe({
            next: () => this.LoadSubjects(true),
            error: (err) => this.notifications.danger(getGraphQLErrorMessage(err, 'No se pudo eliminar la materia.'))
        });
    }
}
