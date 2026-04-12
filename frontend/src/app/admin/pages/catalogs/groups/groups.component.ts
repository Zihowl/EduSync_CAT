import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { map } from 'rxjs';
import {
    IonButton, IonChip, IonContent, IonIcon, IonItem,
    IonFab, IonFabButton, IonInput, IonLabel, IonList, IonSpinner
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
    addCircleOutline,
    addOutline,
    gitBranchOutline,
    layersOutline,
    peopleOutline,
    pencilOutline,
    trashOutline,
} from 'ionicons/icons';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { CatalogToolbarComponent } from '../../../../shared/components/catalog-toolbar/catalog-toolbar.component';
import { NotificationService } from '../../../../shared/services/notification.service';
import { getGraphQLErrorMessage } from '../../../../shared/utils/graphql-error';
import { RealtimeQueryCacheService } from '../../../../core/services/realtime-query-cache.service';
import { RealtimeScope, RealtimeSyncService } from '../../../../core/services/realtime-sync.service';
import { applyCatalogQuery, compareCatalogText, matchesCatalogText, type CatalogToolbarFilterConfig, type CatalogToolbarState } from '../../../../shared/utils/catalog-query';

const GET_GROUPS = gql`
    query GetGroups {
        GetGroups {
            id
            name
            grade
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
            grade
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
            grade
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
        CommonModule, FormsModule, IonButton, IonChip,
        IonContent, IonIcon, IonItem, IonFab, IonFabButton, IonInput,
        IonLabel, IonList, IonSpinner, PageHeaderComponent, ModalComponent, CatalogToolbarComponent,
    ],
    template: `
        <app-page-header
            title="Grupos"
            [showBackButton]="true"
            backDefaultHref="/admin">
        </app-page-header>

        <ion-content class="ion-padding groups-content">
            <div class="app-page-shell app-page-shell--wide">
                <div class="app-page-section">
                    <app-catalog-toolbar
                        [state]="catalogToolbarState"
                        [filters]="groupToolbarFilters"
                        [sortOptions]="groupSortOptions"
                        searchPlaceholder="Buscar..."
                        sortPlaceholder="Ordenar"
                        clearLabel="Limpiar"
                        (stateChange)="OnToolbarChange($event)">
                    </app-catalog-toolbar>
                </div>

                <section class="groups-list-shell app-page-section">
                    <ng-container *ngIf="isGroupsLoaded; else loadingState">
                        <ng-container *ngIf="groupCards.length > 0; else emptyState">
                            <div class="groups-list">
                                <article class="groups-root" *ngFor="let group of groupCards; trackBy: trackByGroupId">
                                    <div class="groups-root__row">
                                        <div class="groups-root__main">
                                            <div class="groups-root__title-row">
                                                <ion-icon name="layers-outline" class="groups-root__icon"></ion-icon>
                                                <h3 class="groups-root__title">{{ group.name }}</h3>
                                                <ion-chip class="groups-chip groups-chip--grade" color="primary">
                                                    <ion-label>{{ formatGradeLabel(group.grade) }}</ion-label>
                                                </ion-chip>
                                            </div>
                                            <p class="groups-root__meta">{{ group.children?.length || 0 }} subgrupos</p>
                                        </div>

                                        <div class="groups-root__actions">
                                            <ion-button fill="clear" color="primary" aria-label="Nuevo subgrupo" title="Nuevo subgrupo" (click)="AddSubgroup(group)">
                                                <ion-icon name="add-outline" slot="icon-only"></ion-icon>
                                            </ion-button>
                                            <ion-button fill="clear" color="medium" aria-label="Editar grupo" title="Editar grupo" (click)="OpenModal(group)">
                                                <ion-icon name="pencil-outline" slot="icon-only"></ion-icon>
                                            </ion-button>
                                            <ion-button fill="clear" color="danger" aria-label="Eliminar grupo" title="Eliminar grupo" (click)="RemoveGroup(group)">
                                                <ion-icon name="trash-outline" slot="icon-only"></ion-icon>
                                            </ion-button>
                                        </div>
                                    </div>

                                    <div class="groups-children" *ngIf="(group.children?.length || 0) > 0; else noChildrenState">
                                        <div class="groups-child" *ngFor="let subgroup of group.children; trackBy: trackByGroupId">
                                            <div class="groups-child__rail">
                                                <ion-icon name="git-branch-outline"></ion-icon>
                                            </div>
                                            <div class="groups-child__main">
                                                <p class="groups-child__title">{{ group.name }}-{{ subgroup.name }}</p>
                                            </div>
                                            <div class="groups-child__actions">
                                                <ion-button fill="clear" color="medium" aria-label="Editar subgrupo" title="Editar subgrupo" (click)="OpenModal(subgroup)">
                                                    <ion-icon name="pencil-outline" slot="icon-only"></ion-icon>
                                                </ion-button>
                                                <ion-button fill="clear" color="danger" aria-label="Eliminar subgrupo" title="Eliminar subgrupo" (click)="RemoveGroup(subgroup)">
                                                    <ion-icon name="trash-outline" slot="icon-only"></ion-icon>
                                                </ion-button>
                                            </div>
                                        </div>
                                    </div>

                                    <ng-template #noChildrenState>
                                        <div class="groups-empty-inline">
                                            <ion-icon name="people-outline"></ion-icon>
                                            <span>Sin subgrupos</span>
                                        </div>
                                    </ng-template>
                                </article>
                            </div>
                        </ng-container>
                    </ng-container>

                    <ng-template #loadingState>
                        <div class="groups-state groups-state--loading">
                            <ion-spinner name="crescent"></ion-spinner>
                            <span>Cargando...</span>
                        </div>
                    </ng-template>

                    <ng-template #emptyState>
                        <div class="groups-state groups-state--empty">
                            <ion-icon name="people-outline"></ion-icon>
                            <strong>{{ hasGroupCriteria() ? 'Sin resultados' : 'Sin grupos' }}</strong>
                            <span>{{ hasGroupCriteria() ? 'Prueba otro filtro.' : 'Crea el primero con +' }}</span>
                        </div>
                    </ng-template>
                </section>
            </div>

            <ion-fab class="groups-fab" vertical="bottom" horizontal="end" slot="fixed">
                <ion-fab-button (click)="OpenNewGroup()">
                    <ion-icon name="add-outline"></ion-icon>
                </ion-fab-button>
            </ion-fab>

            <app-modal
                [(isOpen)]="isModalOpen"
                [title]="getModalTitle()"
                subtitle="Grado solo para grupos raíz. Subgrupos heredan el contexto."
                [saveLabel]="editingItem ? 'Actualizar' : 'Guardar'"
                [saveDisabled]="!formData.name"
                (save)="Save()">
                <ng-template #modalBody>
                    <ion-list>
                        <ion-item fill="outline">
                            <ion-label position="stacked">
                                <ion-icon name="people-outline" class="label-icon"></ion-icon>
                                {{ formData.parentId !== null ? 'Nombre del Subgrupo *' : 'Nombre del Grupo *' }}
                            </ion-label>
                            <ion-input
                                [(ngModel)]="formData.name"
                                [placeholder]="formData.parentId !== null ? 'Ej. 1, Software, Principiantes' : 'Ej. A, Ajedrez o Taller'">
                            </ion-input>
                        </ion-item>

                        <ion-item fill="outline" class="ion-margin-top" *ngIf="formData.parentId === null">
                            <ion-label position="stacked">
                                <ion-icon name="layers-outline" class="label-icon"></ion-icon>
                                Grado (Opcional)
                            </ion-label>
                            <ion-input type="number" [(ngModel)]="formData.grade" placeholder="Ej. 1, 2, 3 (dejar vacío para talleres)"></ion-input>
                        </ion-item>

                        <p *ngIf="formData.parentId !== null" class="groups-modal-preview">
                            <ion-icon name="git-branch-outline" class="groups-modal-preview__icon"></ion-icon>
                            <span class="groups-modal-preview__label">{{ getParentName(formData.parentId) }}-</span>
                            <strong>{{ formData.name || '...' }}</strong>
                        </p>
                    </ion-list>
                </ng-template>
            </app-modal>
        </ion-content>
    `,
    styleUrls: ['./groups.component.scss']
})
export class GroupsComponent implements OnInit {
    private apollo = inject(Apollo);
    private queryCache = inject(RealtimeQueryCacheService);
    private realtimeSync = inject(RealtimeSyncService);
    private destroyRef = inject(DestroyRef);
    private cdr = inject(ChangeDetectorRef);
    private notifications = inject(NotificationService);

    allGroups: any[] = [];
    groupCards: any[] = [];
    catalogToolbarState: CatalogToolbarState = {
        searchQuery: '',
        sortValue: '',
        sortDirection: 'asc',
        filters: {
            type: '',
            grade: '',
        },
    };
    readonly groupSortOptions = [
        { value: 'grade', label: 'Grado' },
        { value: 'name', label: 'Nombre' },
    ];
    readonly groupTypeFilter: CatalogToolbarFilterConfig = {
        key: 'type',
        label: 'Tipo',
        placeholder: 'Tipo de grupo',
        defaultValue: '',
        options: [
            { value: '__all__', label: 'Todos' },
            { value: 'root', label: 'Solo grupos principales' },
            { value: 'subgroup', label: 'Solo subgrupos' },
        ],
    };
    groupToolbarFilters: CatalogToolbarFilterConfig[] = [
        this.groupTypeFilter,
        {
            key: 'grade',
            label: 'Grado',
            placeholder: 'Filtrar por grado',
            defaultValue: '',
            options: [
                { value: '__all__', label: 'Todos' },
                { value: '__none__', label: 'Sin grado' },
            ],
        },
    ];
    isGroupsLoaded = false;
    isModalOpen = false;
    editingItem: any = null;
    formData = {
        name: '',
        parentId: null as number | null,
        grade: null as number | null,
    };

    ngOnInit() {
        addIcons({
            addCircleOutline,
            addOutline,
            gitBranchOutline,
            layersOutline,
            peopleOutline,
            pencilOutline,
            trashOutline,
        });
        this.setupRealtimeRefresh();
    }

    ionViewWillEnter(): void {
        this.LoadGroups();
    }

    ionViewWillLeave(): void {
        this.isGroupsLoaded = true;
        this.cdr.detectChanges();
    }

    LoadGroups(forceRefresh = false) {
        if (forceRefresh) {
            this.isGroupsLoaded = false;
        }

        const request$ = forceRefresh
            ? this.queryCache.refresh(
                'admin-groups',
                [RealtimeScope.Groups],
                () => this.apollo.query<any>({ query: GET_GROUPS, fetchPolicy: 'network-only' }).pipe(
                    map((res: any) => res?.data?.GetGroups ?? [])
                )
            )
            : this.queryCache.load(
                'admin-groups',
                [RealtimeScope.Groups],
                () => this.apollo.query<any>({ query: GET_GROUPS, fetchPolicy: 'network-only' }).pipe(
                    map((res: any) => res?.data?.GetGroups ?? [])
                )
            );

        request$.subscribe({
            next: (rawGroups: any[]) => {
                try {
                    const normalized = this.normalizeParents(rawGroups ?? []);
                    this.allGroups = [...normalized];
                    this.refreshGroupToolbarFilters();
                    this.ApplyFilter();
                } catch (err) {
                    console.error('Error al procesar grupos:', err);
                    this.allGroups = [];
                    this.groupCards = [];
                } finally {
                    this.isGroupsLoaded = true;
                    this.cdr.detectChanges();
                }
            },
            error: (err) => {
                console.error('Error al cargar grupos:', err);
                this.notifications.danger('Error al cargar grupos: ' + err.message);
                this.isGroupsLoaded = true;
                this.cdr.detectChanges();
            }
        });
    }

    private setupRealtimeRefresh(): void {
        this.realtimeSync.watchScopes([RealtimeScope.Groups])
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.LoadGroups(true));
    }

    OnToolbarChange(state: CatalogToolbarState) {
        this.catalogToolbarState = state;
        this.ApplyFilter();
    }

    ApplyFilter() {
        const matched = applyCatalogQuery(this.allGroups, this.catalogToolbarState, {
            searchPredicate: (group: any, normalizedQuery: string) =>
                matchesCatalogText(group?.name, normalizedQuery) ||
                matchesCatalogText(group?.parent?.name, normalizedQuery) ||
                matchesCatalogText(group?.grade, normalizedQuery),
            filterPredicates: {
                type: (group: any, value: string) => {
                    if (value === 'root') {
                        return !group.parent;
                    }

                    if (value === 'subgroup') {
                        return !!group.parent;
                    }

                    return true;
                },
                grade: (group: any, value: string) => {
                    if (group.parent) {
                        return false;
                    }

                    if (value === '__none__') {
                        return group.grade == null;
                    }

                    return String(group.grade ?? '') === value;
                },
            },
        });

        const allowedIds = new Set<number>();

        matched.forEach((group) => {
            allowedIds.add(Number(group.id));

            if (group.parent) {
                allowedIds.add(Number(group.parent.id));
                return;
            }

            this.allGroups
                .filter((child) => child.parent && Number(child.parent.id) === Number(group.id))
                .forEach((child) => allowedIds.add(Number(child.id)));
        });

        this.groupCards = this.buildGroupCards(this.allGroups, allowedIds);
    }

    OpenModal(item: any = null) {
        this.editingItem = item;
        if (item) {
            this.formData = {
                name: item.name,
                parentId: item.parent ? Number(item.parent.id) : null,
                grade: item.grade != null ? Number(item.grade) : null,
            };
        } else {
            this.formData = { name: '', parentId: null, grade: null };
        }
        this.isModalOpen = true;
    }

    OpenNewGroup() {
        this.editingItem = null;
        this.formData = { name: '', parentId: null, grade: null };
        this.isModalOpen = true;
    }

    AddSubgroup(parent: any) {
        this.editingItem = null;
        this.formData = {
            name: '',
            parentId: Number(parent.id),
            grade: null,
        };
        this.isModalOpen = true;
    }

    getModalTitle(): string {
        if (this.editingItem) {
            return this.editingItem.parent ? 'Editar Subgrupo' : 'Editar Grupo Principal';
        }

        return this.formData.parentId !== null ? 'Nuevo Subgrupo' : 'Nuevo Grupo Principal';
    }

    Save() {
        if (!this.formData.name) return;

        const groupInput: any = {
            name: this.formData.name,
        };

        if (this.formData.parentId !== null) {
            groupInput.parentId = Number(this.formData.parentId);
            groupInput.grade = null;
        } else {
            groupInput.parentId = null;
            groupInput.grade = this.formData.grade != null && String(this.formData.grade).trim() !== ''
                ? Number(this.formData.grade)
                : null;
        }

        if (this.editingItem) {
            this.apollo.mutate({
                mutation: UPDATE_GROUP,
                variables: {
                    input: {
                        id: Number(this.editingItem.id),
                        ...groupInput,
                    },
                }
            }).subscribe({
                next: () => {
                    this.isModalOpen = false;
                    this.editingItem = null;
                    this.LoadGroups(true);
                },
                error: (err) => {
                    console.error('Error al actualizar grupo:', err);
                    this.notifications.danger(getGraphQLErrorMessage(err, 'No se pudo guardar el grupo.'));
                }
            });
        } else {
            this.apollo.mutate({
                mutation: CREATE_GROUP,
                variables: { input: groupInput },
            }).subscribe({
                next: () => {
                    this.isModalOpen = false;
                    this.LoadGroups(true);
                },
                error: (err) => {
                    console.error('Error al crear grupo:', err);
                    this.notifications.danger(getGraphQLErrorMessage(err, 'No se pudo guardar el grupo.'));
                }
            });
        }
    }

    async RemoveGroup(group: any) {
        if (this.hasChildren(group.id)) {
            this.notifications.warning('No se puede eliminar un grupo que contiene subgrupos. Elimina primero los subgrupos.', 'No se puede eliminar');
            return;
        }

        if (!(await this.notifications.confirm({
            title: 'Eliminar grupo',
            message: `¿Seguro que desea eliminar ${this.getGroupPath(group)}?`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            confirmColor: 'danger',
            styleType: 'danger'
        }))) return;

        this.apollo.mutate({
            mutation: REMOVE_GROUP,
            variables: { id: Number(group.id) },
        }).subscribe({
            next: () => this.LoadGroups(true),
            error: (err) => {
                console.error('Error al eliminar grupo:', err);
                this.notifications.danger(getGraphQLErrorMessage(err, 'No se pudo eliminar el grupo.'));
            }
        });
    }

    hasChildren(groupId: any): boolean {
        return this.allGroups.some((group) => group.parent && Number(group.parent.id) === Number(groupId));
    }

    getParentName(id: any): string {
        const parent = this.allGroups.find((group) => !group.parent && Number(group.id) === Number(id));
        return parent ? parent.name : '';
    }

    getGroupPath(group: any): string {
        return group?.parent ? `el subgrupo "${group.parent.name}-${group.name}"` : `el grupo principal "${group.name}"`;
    }

    getVisibleSummaryText(): string {
        const rootCount = this.groupCards.length;
        const subgroupCount = this.groupCards.reduce((total, group) => total + (group.children?.length ?? 0), 0);

        return `Mostrando ${rootCount} ${this.pluralize(rootCount, 'grupo principal', 'grupos principales')} y ${subgroupCount} ${this.pluralize(subgroupCount, 'subgrupo', 'subgrupos')} en la vista actual.`;
    }

    formatRootSummary(group: any): string {
        const childCount = group?.children?.length ?? 0;

        if (childCount === 0) {
            return 'Todavía no tiene subgrupos. Usa el botón Subgrupo para crear el primero.';
        }

        return `Contiene ${childCount} ${childCount === 1 ? 'subgrupo' : 'subgrupos'} listos para horarios y edición.`;
    }

    formatSubgroupSummary(group: any): string {
        return `Subgrupo del grupo principal ${group?.name ?? ''}`;
    }

    formatGradeLabel(grade: number | null): string {
        return grade == null ? 'Sin grado' : `Grado ${grade}`;
    }

    hasGroupCriteria(): boolean {
        if (this.catalogToolbarState.searchQuery.trim().length > 0) {
            return true;
        }

        if (this.catalogToolbarState.sortValue !== '') {
            return true;
        }

        if (this.catalogToolbarState.sortDirection === 'desc') {
            return true;
        }

        return Object.entries(this.catalogToolbarState.filters ?? {}).some(([, value]) => {
            const normalized = String(value ?? '').trim();
            return normalized !== '' && normalized !== '__all__';
        });
    }

    get rootGroupCount(): number {
        return this.allGroups.filter((group) => !group.parent).length;
    }

    get subgroupCount(): number {
        return this.allGroups.filter((group) => !!group.parent).length;
    }

    get ungradedRootGroupCount(): number {
        return this.allGroups.filter((group) => !group.parent && (group.grade == null || String(group.grade).trim() === '')).length;
    }

    private refreshGroupToolbarFilters(): void {
        this.groupToolbarFilters = [
            this.groupTypeFilter,
            {
                key: 'grade',
                label: 'Grado',
                placeholder: 'Filtrar por grado',
                defaultValue: '',
                options: [
                    { value: '__all__', label: 'Todos' },
                    { value: '__none__', label: 'Sin grado' },
                    ...this.buildGradeFilterOptions(),
                ],
            },
        ];
    }

    private buildGradeFilterOptions(): Array<{ label: string; value: string }> {
        const gradeValues = new Set<number>();

        this.allGroups.forEach((group) => {
            if (!group.parent && group.grade != null && String(group.grade).trim() !== '') {
                gradeValues.add(Number(group.grade));
            }
        });

        return Array.from(gradeValues)
            .sort((left, right) => left - right)
            .map((grade) => ({
                value: String(grade),
                label: `Grado ${grade}`,
            }));
    }

    private normalizeParents(groups: any[]): any[] {
        const byId = new Map<number, any>();
        const copies = groups.map((group) => ({ ...group }));

        copies.forEach((group) => byId.set(Number(group.id), group));

        copies.forEach((group) => {
            if (group.parent && group.parent.id != null) {
                const parent = byId.get(Number(group.parent.id));

                if (parent) {
                    group.parent = parent;
                }
            }
        });

        return copies;
    }

    private buildGroupCards(groups: any[], allowedIds?: Set<number>): any[] {
        const compareRoots = (left: any, right: any): number => {
            if (this.catalogToolbarState.sortValue === 'name') {
                return this.compareByName(left, right);
            }

            const leftHasGrade = left?.grade != null && String(left.grade).trim() !== '';
            const rightHasGrade = right?.grade != null && String(right.grade).trim() !== '';

            if (leftHasGrade !== rightHasGrade) {
                return leftHasGrade ? -1 : 1;
            }

            const gradeComparison = this.compareGrade(left?.grade, right?.grade);
            if (gradeComparison !== 0) {
                return this.catalogToolbarState.sortDirection === 'desc' ? -gradeComparison : gradeComparison;
            }

            return this.compareByName(left, right);
        };

        const compareChildren = (left: any, right: any): number => this.compareByName(left, right);

        const roots = groups
            .filter((group) => !group.parent && (!allowedIds || allowedIds.has(Number(group.id))))
            .sort(compareRoots)
            .map((root) => ({
                ...root,
                children: [] as any[],
            }));

        const rootsById = new Map<number, any>();
        roots.forEach((root) => rootsById.set(Number(root.id), root));

        groups.forEach((group) => {
            if (!group.parent) {
                return;
            }

            const parentId = Number(group.parent.id);

            if (allowedIds && !allowedIds.has(Number(group.id))) {
                return;
            }

            const parent = rootsById.get(parentId);
            if (!parent) {
                return;
            }

            parent.children.push(group);
        });

        roots.forEach((root) => {
            root.children.sort(compareChildren);
        });

        return roots;
    }

    private compareByName(left: any, right: any): number {
        const comparison = compareCatalogText(left?.name, right?.name);
        return this.catalogToolbarState.sortDirection === 'desc' ? -comparison : comparison;
    }

    private compareGrade(leftGrade: unknown, rightGrade: unknown): number {
        const left = leftGrade == null || String(leftGrade).trim() === '' ? Number.POSITIVE_INFINITY : Number(leftGrade);
        const right = rightGrade == null || String(rightGrade).trim() === '' ? Number.POSITIVE_INFINITY : Number(rightGrade);

        if (left === right) {
            return 0;
        }

        return left < right ? -1 : 1;
    }

    private pluralize(count: number, singular: string, plural: string): string {
        return count === 1 ? singular : plural;
    }

    trackByGroupId(index: number, group: any): number {
        return Number(group?.id ?? index);
    }
}