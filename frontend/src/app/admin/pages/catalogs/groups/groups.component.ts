import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { map } from 'rxjs';
import { 
    IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, 
    IonList, IonItem, IonLabel, 
    IonButton, IonIcon, IonFab, IonFabButton, 
    IonModal, IonInput, IonFooter, IonSearchbar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trashOutline, addOutline, pencilOutline, peopleOutline, personOutline, searchOutline, returnDownForward, addCircleOutline, people, person } from 'ionicons/icons';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { RealtimeQueryCacheService } from '../../../../core/services/realtime-query-cache.service';
import { RealtimeScope, RealtimeSyncService } from '../../../../core/services/realtime-sync.service';

const GET_GROUPS = gql`
    query GetGroups {
        GetGroups {
            id
            name
            parent {
                id
                name
            }
        }
    }
`;

const CREATE_GROUP = gql`
    mutation CreateGroup($input: CreateGroupInput!) {
        CreateGroup(input: $input) {
            id
            name
            parent {
                id
                name
            }
        }
    }
`;

const UPDATE_GROUP = gql`
    mutation UpdateGroup($input: UpdateGroupInput!) {
        UpdateGroup(input: $input) {
            id
            name
            parent {
                id
                name
            }
        }
    }
`;

const REMOVE_GROUP = gql`
    mutation RemoveGroup($id: Int!) {
        RemoveGroup(id: $id)
    }
`;

@Component({
    selector: 'app-groups',
    standalone: true,
    imports: [
        CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, 
        IonTitle, IonButtons, IonList, IonItem, 
        IonLabel, IonButton, IonIcon, 
        IonFab, IonFabButton, IonModal, IonInput, IonFooter, IonSearchbar, PageHeaderComponent
    ],
    template: `
        <app-page-header title="Grupos" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding">
            <div class="app-page-shell app-page-shell--medium">
                <div class="app-page-section">
                    <ion-searchbar (ionInput)="Filter($event)" placeholder="Buscar grupo..." show-clear-button="always"></ion-searchbar>
                </div>
                <ion-list lines="inset">
                    <ion-item *ngFor="let g of filteredGroups" [class.groups-subgroup-item]="g.parent">
                        <ion-icon [name]="g.parent ? 'return-down-forward' : 'people-outline'" slot="start" [color]="g.parent ? 'medium' : 'primary'"></ion-icon>
                        <ion-label>
                            <h2 class="groups-title"><span *ngIf="g.parent" class="groups-parent-prefix">{{ g.parent.name }}-</span>{{ g.name }}</h2>
                            <p *ngIf="!g.parent">Grupo Base</p>
                        </ion-label>
                        <ion-buttons slot="end">
                            <ion-button *ngIf="!g.parent" color="primary" (click)="AddSubgroup(g)">
                                <ion-icon name="add-circle-outline" slot="icon-only"></ion-icon>
                            </ion-button>
                            <ion-button color="medium" (click)="OpenModal(g)">
                                <ion-icon name="pencil-outline" slot="icon-only"></ion-icon>
                            </ion-button>
                            <ion-button color="danger" (click)="RemoveGroup(g)">
                                <ion-icon name="trash-outline" slot="icon-only"></ion-icon>
                            </ion-button>
                        </ion-buttons>
                    </ion-item>
                </ion-list>

                <div *ngIf="filteredGroups.length === 0" class="groups-empty-state">
                    <ion-icon name="people-outline" class="groups-empty-icon"></ion-icon>
                    <p>{{ allGroups.length === 0 ? 'No hay grupos registrados' : 'No se encontraron resultados' }}</p>
                </div>

                <ion-fab vertical="bottom" horizontal="end" slot="fixed">
                    <ion-fab-button (click)="OpenNewGroup()">
                        <ion-icon name="add-outline"></ion-icon>
                    </ion-fab-button>
                </ion-fab>

                <ion-modal [isOpen]="isModalOpen" (didDismiss)="isModalOpen = false">
                    <ng-template>
                        <ion-header>
                            <ion-toolbar color="primary">
                                <ion-title>{{ getModalTitle() }}</ion-title>
                                <ion-buttons slot="end">
                                    <ion-button (click)="isModalOpen = false">Cerrar</ion-button>
                                </ion-buttons>
                            </ion-toolbar>
                        </ion-header>
                        <ion-content class="ion-padding">
                            <ion-list>
                                <ion-item fill="outline" class="groups-form-item">
                                    <ion-label position="stacked">{{ formData.parentId ? 'Nombre del Subgrupo' : 'Nombre del Grupo' }}</ion-label>
                                    <ion-input [(ngModel)]="formData.name" [placeholder]="formData.parentId ? 'Ej. Desarrollo, A, 1...' : 'Ej. 8A, Sistemas...' "></ion-input>
                                    <ion-icon name="people-outline" slot="start"></ion-icon>
                                </ion-item>

                                <p *ngIf="formData.parentId" class="groups-preview-text">
                                    <ion-icon name="arrow-forward-outline" class="groups-preview-icon"></ion-icon>
                                    <span class="groups-preview-label">{{ getParentName(formData.parentId) }}-</span><strong>{{ formData.name || '...' }}</strong>
                                </p>
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
    styleUrls: ['./groups.component.scss']
})
export class GroupsComponent implements OnInit
{
    private apollo = inject(Apollo);
    private queryCache = inject(RealtimeQueryCacheService);
    private realtimeSync = inject(RealtimeSyncService);
    private destroyRef = inject(DestroyRef);

    allGroups: any[] = [];
    groups: any[] = [];
    filteredGroups: any[] = [];
    searchQuery: string = '';
    isModalOpen = false;
    editingItem: any = null;
    formData = {
        name: '',
        parentId: null as number | null
    };

    hasChildren(groupId: any): boolean {
        return this.allGroups.some(g => g.parent && Number(g.parent.id) === Number(groupId));
    }

    getParentName(id: any): string {
        const parent = this.allGroups.find(g => !g.parent && Number(g.id) === Number(id));
        return parent ? parent.name : '';
    }

    private normalizeParents(groups: any[]): any[] {
        const byId = new Map<number, any>();
        
        // Crear copias de los objetos para evitar mutación
        const copies = groups.map(g => ({ ...g }));
        copies.forEach(g => byId.set(Number(g.id), g));

        copies.forEach(g => {
            if (g.parent && g.parent.id != null) {
                const parent = byId.get(Number(g.parent.id));
                if (parent) {
                    g.parent = parent;
                }
            }
        });

        return copies;
    }

    private buildHierarchy(groups: any[], allowedIds?: Set<number>): any[] {
        const roots = groups
            .filter(g => !g.parent && (!allowedIds || allowedIds.has(Number(g.id))))
            .sort((a, b) => a.name.localeCompare(b.name));

        const childrenByParent = new Map<number, any[]>();
        groups.forEach(g => {
            if (!g.parent) return;
            const parentId = Number(g.parent.id);
            if (allowedIds && !allowedIds.has(Number(g.id))) return;
            const list = childrenByParent.get(parentId) ?? [];
            list.push(g);
            childrenByParent.set(parentId, list);
        });

        const result: any[] = [];
        roots.forEach(root => {
            result.push(root);
            const children = childrenByParent.get(Number(root.id)) ?? [];
            children.sort((a, b) => a.name.localeCompare(b.name));
            result.push(...children);
        });

        return result;
    }

    ngOnInit() {
        addIcons({ trashOutline, addOutline, pencilOutline, peopleOutline, personOutline, searchOutline, returnDownForward, addCircleOutline, people, person });
        this.setupRealtimeRefresh();
    }

    ionViewWillEnter(): void {
        this.LoadGroups();
    }

    LoadGroups() {
        this.queryCache.load(
            'admin-groups',
            [RealtimeScope.Groups],
            () => this.apollo.query<any>({ query: GET_GROUPS, fetchPolicy: 'network-only' }).pipe(
                map((res: any) => res?.data?.GetGroups ?? [])
            )
        ).subscribe({
            next: (rawGroups: any[]) => {
                console.log('GetGroups response:', rawGroups);
                console.log('Raw groups:', rawGroups);
                const normalized = this.normalizeParents(rawGroups);
                this.allGroups = [...normalized];
                this.groups = this.buildHierarchy(this.allGroups);
                this.ApplyFilter();
                console.log('Filtered groups:', this.filteredGroups);
            },
            error: (err) => {
                console.error('Error loading groups:', err);
                alert('Error al cargar grupos: ' + err.message);
            }
        });
    }

    private setupRealtimeRefresh(): void {
        this.realtimeSync.watchScopes([RealtimeScope.Groups])
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.LoadGroups());
    }

    Filter(event: any) {
        this.searchQuery = event.detail.value?.toLowerCase() || '';
        this.ApplyFilter();
    }

    ApplyFilter() {
        if (!this.searchQuery) {
            this.filteredGroups = this.buildHierarchy(this.allGroups);
            return;
        }

        const matched = this.allGroups.filter(g => 
            g.name.toLowerCase().includes(this.searchQuery) || 
            (g.parent && g.parent.name.toLowerCase().includes(this.searchQuery))
        );

        const allowedIds = new Set<number>();
        matched.forEach(g => {
            allowedIds.add(Number(g.id));

            if (g.parent) {
                allowedIds.add(Number(g.parent.id));
            } else {
                // Incluir subgrupos del grupo raíz para mantener contexto
                this.allGroups
                    .filter(child => child.parent && Number(child.parent.id) === Number(g.id))
                    .forEach(child => allowedIds.add(Number(child.id)));
            }
        });

        this.filteredGroups = this.buildHierarchy(this.allGroups, allowedIds);
    }

    OpenModal(item: any = null) {
        this.editingItem = item;
        if (item) {
            this.formData = { 
                name: item.name, 
                parentId: item.parent ? Number(item.parent.id) : null 
            };
        } else {
            this.formData = { name: '', parentId: null };
        }
        this.isModalOpen = true;
    }

    OpenNewGroup() {
        this.editingItem = null;
        this.formData = { name: '', parentId: null };
        this.isModalOpen = true;
    }

    AddSubgroup(parent: any) {
        this.editingItem = null;
        this.formData = {
            name: '',
            parentId: Number(parent.id)
        };
        this.isModalOpen = true;
    }

    getModalTitle(): string {
        if (this.editingItem) {
            return this.editingItem.parent ? 'Editar Subgrupo' : 'Editar Grupo';
        }
        return this.formData.parentId ? 'Nuevo Subgrupo' : 'Nuevo Grupo';
    }

    Save() {
        if (!this.formData.name) return;

        const groupInput: any = { 
            name: this.formData.name 
        };
        
        // Solo enviar parentId si se seleccionó uno
        if (this.formData.parentId) {
            groupInput.parentId = Number(this.formData.parentId);
        } else {
            groupInput.parentId = null;
        }

        if (this.editingItem) {
            this.apollo.mutate({
                mutation: UPDATE_GROUP,
                variables: { 
                    input: { 
                        id: Number(this.editingItem.id),
                        ...groupInput
                    } 
                }
            }).subscribe({
                next: () => { 
                    this.isModalOpen = false;
                    this.editingItem = null;
                    this.LoadGroups();
                },
                error: (err) => {
                    console.error('Update group error:', err);
                    alert('Error al actualizar: ' + err.message);
                }
            });
        } else {
            this.apollo.mutate({
                mutation: CREATE_GROUP,
                variables: { input: groupInput },
            }).subscribe({
                next: () => {
                    this.isModalOpen = false;
                    this.LoadGroups();
                },
                error: (err) => {
                    console.error('Create group error:', err);
                    alert('Error al crear: ' + err.message);
                }
            });
        }
    }

    RemoveGroup(group: any) {
        if (this.hasChildren(group.id)) {
            alert('No se puede eliminar un grupo que contiene subgrupos. Elimina primero los subgrupos.');
            return;
        }

        if (!confirm(`¿Seguro que desea eliminar el grupo "${group.parent ? group.parent.name + '-' : ''}${group.name}"?`)) return;
        
        this.apollo.mutate({
            mutation: REMOVE_GROUP,
            variables: { id: Number(group.id) },
        }).subscribe({
            next: () => this.LoadGroups(),
            error: (err) => {
                console.error('Delete group error:', err);
                alert('Error al eliminar: ' + err.message);
            }
        });
    }
}
