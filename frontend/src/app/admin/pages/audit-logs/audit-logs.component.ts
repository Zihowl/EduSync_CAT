import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { map } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
    IonContent,
    IonCard,
    IonCardContent,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonButton,
    IonBadge,
    IonItem,
    IonLabel,
    IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
    addCircleOutline,
    calendarOutline,
    chevronBackOutline,
    chevronForwardOutline,
    createOutline,
    documentTextOutline,
    eyeOutline,
    funnelOutline,
    lockClosedOutline,
    lockOpenOutline,
    refreshOutline,
    searchOutline,
    settingsOutline,
    timeOutline,
    trashOutline,
} from 'ionicons/icons';

import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataListComponent } from '../../../shared/components/data-list/data-list.component';
import { RealtimeScope, RealtimeSyncService } from '../../../core/services/realtime-sync.service';

interface AuditLogRow {
    id: string;
    actorUserId: string | null;
    actorEmail: string | null;
    actorRole: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    details: Record<string, unknown> | null;
    createdAt: string;
}

interface AuditLogPageResponse {
    items: AuditLogRow[];
    totalCount: number;
    page: number;
    limit: number;
}

interface AuditLogFilterInput {
    action?: string;
    resourceType?: string;
    resourceId?: string;
    actorEmail?: string;
    actorRole?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
    page: number;
    limit: number;
}

const GET_AUDIT_LOGS = gql`
    query GetAuditLogs($filter: AuditLogFilterInput) {
        GetAuditLogs(filter: $filter) {
            items {
                id
                actorUserId
                actorEmail
                actorRole
                action
                resourceType
                resourceId
                details
                createdAt
            }
            totalCount
            page
            limit
        }
    }
`;

@Component({
    selector: 'app-audit-logs',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        IonContent,
        IonCard,
        IonCardContent,
        IonSearchbar,
        IonSelect,
        IonSelectOption,
        IonInput,
        IonButton,
        IonBadge,
        IonItem,
        IonLabel,
        IonIcon,
        PageHeaderComponent,
        DataListComponent,
    ],
    template: `
        <app-page-header
            title="Bitácora de Auditoría"
            [showBackButton]="true"
            backDefaultHref="/admin"
        ></app-page-header>

        <ion-content class="ion-padding audit-content">
            <div class="app-page-shell app-page-shell--wide audit-shell">
                <ion-card class="audit-summary-card">
                    <ion-card-content>
                        <div class="audit-summary-card__label">Registros totales</div>
                        <div class="audit-summary-card__value">{{ totalCount }}</div>
                        <div class="audit-summary-card__meta">
                            Mostrando {{ displayRangeStart }}-{{ displayRangeEnd }} de {{ totalCount }}
                        </div>
                    </ion-card-content>
                </ion-card>

                <ion-card class="audit-filters-card app-page-section">
                    <ion-card-content>
                        <div class="audit-filters-grid">
                            <ion-searchbar
                                [(ngModel)]="searchQuery"
                                [debounce]="300"
                                placeholder="Buscar por acción, actor o recurso"
                                show-clear-button="always"
                                (ionInput)="OnSearchChange($event)">
                            </ion-searchbar>

                            <ion-select [(ngModel)]="actionFilter" interface="popover" placeholder="Acción" (ionChange)="OnFilterChange()">
                                <ion-select-option value="">Todas las acciones</ion-select-option>
                                <ion-select-option *ngFor="let option of actionOptions" [value]="option.value">{{ option.label }}</ion-select-option>
                            </ion-select>

                            <ion-select [(ngModel)]="resourceFilter" interface="popover" placeholder="Recurso" (ionChange)="OnFilterChange()">
                                <ion-select-option value="">Todos los recursos</ion-select-option>
                                <ion-select-option *ngFor="let option of resourceOptions" [value]="option.value">{{ option.label }}</ion-select-option>
                            </ion-select>

                            <ion-select [(ngModel)]="actorRoleFilter" interface="popover" placeholder="Rol" (ionChange)="OnFilterChange()">
                                <ion-select-option value="">Todos los roles</ion-select-option>
                                <ion-select-option *ngFor="let option of actorRoleOptions" [value]="option.value">{{ option.label }}</ion-select-option>
                            </ion-select>

                            <ion-input
                                type="date"
                                label="Desde"
                                label-placement="stacked"
                                fill="outline"
                                [(ngModel)]="fromDate"
                                (ionChange)="OnFilterChange()">
                            </ion-input>

                            <ion-input
                                type="date"
                                label="Hasta"
                                label-placement="stacked"
                                fill="outline"
                                [(ngModel)]="toDate"
                                (ionChange)="OnFilterChange()">
                            </ion-input>

                            <ion-select [(ngModel)]="pageSize" interface="popover" placeholder="Filas por página" (ionChange)="OnPageSizeChange()">
                                <ion-select-option *ngFor="let option of pageSizeOptions" [value]="option">{{ option }} por página</ion-select-option>
                            </ion-select>

                            <ion-button fill="outline" color="medium" class="audit-clear-button" (click)="ClearFilters()">
                                <ion-icon name="refresh-outline" slot="start"></ion-icon>
                                Restablecer filtros
                            </ion-button>
                        </div>
                    </ion-card-content>
                </ion-card>

                <app-data-list
                    [items]="auditLogs"
                    [loaded]="isLoaded"
                    [trackByFn]="trackById"
                    loadingText="Cargando bitácora..."
                    emptyIcon="document-text-outline"
                    [emptyTitle]="emptyTitle"
                    [emptySubtitle]="emptySubtitle"
                    cardClass="audit-list-card">
                    <ng-template #itemTemplate let-log>
                        <ion-item lines="none" class="audit-item">
                            <ion-icon slot="start" [name]="iconForAction(log.action)" [color]="toneForAction(log.action)" class="audit-item__icon"></ion-icon>
                            <ion-label class="audit-item__label">
                                <h2>{{ actionLabel(log.action) }}</h2>
                                <p>
                                    <strong>{{ log.actorEmail || 'Sistema' }}</strong>
                                    <span class="audit-dot">•</span>
                                    {{ log.actorRole }}
                                    <span class="audit-dot">•</span>
                                    {{ formatTimestamp(log.createdAt) }}
                                </p>
                                <p>
                                    <ion-badge [color]="toneForAction(log.action)">{{ resourceLabel(log.resourceType) }}</ion-badge>
                                    <span class="audit-resource-id" *ngIf="log.resourceId">{{ log.resourceId }}</span>
                                </p>
                                <small>{{ formatDetails(log.details) }}</small>
                            </ion-label>
                        </ion-item>
                    </ng-template>
                </app-data-list>

                <div class="audit-pagination" *ngIf="totalCount > 0">
                    <ion-button fill="outline" color="medium" [disabled]="page <= 1" (click)="PreviousPage()">
                        <ion-icon name="chevron-back-outline" slot="start"></ion-icon>
                        Anterior
                    </ion-button>

                    <div class="audit-pagination__status">
                        Página {{ page }} de {{ totalPages }}
                    </div>

                    <ion-button fill="outline" color="medium" [disabled]="page >= totalPages" (click)="NextPage()">
                        Siguiente
                        <ion-icon name="chevron-forward-outline" slot="end"></ion-icon>
                    </ion-button>
                </div>
            </div>
        </ion-content>
    `,
    styleUrls: ['./audit-logs.component.scss'],
})
export class AuditLogsComponent implements OnInit {
    private readonly apollo = inject(Apollo);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly destroyRef = inject(DestroyRef);
    private readonly realtimeSync = inject(RealtimeSyncService);

    auditLogs: AuditLogRow[] = [];
    totalCount = 0;
    page = 1;
    pageSize = 20;
    searchQuery = '';
    actionFilter = '';
    resourceFilter = '';
    actorRoleFilter = '';
    fromDate = '';
    toDate = '';
    isLoaded = false;

    readonly pageSizeOptions = [10, 20, 50];
    readonly actionOptions = [
        { value: 'create_admin', label: 'Alta de administrador' },
        { value: 'disable_admin_access', label: 'Inhabilitación de acceso' },
        { value: 'reactivate_admin_access', label: 'Reactivación de acceso' },
        { value: 'force_reset_admin_password', label: 'Restablecimiento forzado' },
        { value: 'create_allowed_domain', label: 'Alta de dominio' },
        { value: 'remove_allowed_domain', label: 'Eliminación de dominio' },
        { value: 'set_current_school_year', label: 'Cambio de ciclo escolar' },
        { value: 'create_schedule_slot', label: 'Alta de horario' },
        { value: 'update_schedule_slot', label: 'Edición de horario' },
        { value: 'remove_schedule_slot', label: 'Eliminación de horario' },
        { value: 'set_schedules_published', label: 'Publicación masiva de horarios' },
    ];
    readonly resourceOptions = [
        { value: 'user', label: 'Usuarios' },
        { value: 'allowed_domain', label: 'Dominios permitidos' },
        { value: 'school_year', label: 'Ciclo escolar' },
        { value: 'schedule_slot', label: 'Horario' },
        { value: 'schedule_batch', label: 'Publicación masiva' },
    ];
    readonly actorRoleOptions = [
        { value: 'SUPER_ADMIN', label: 'Súper Administrador' },
        { value: 'ADMIN_HORARIOS', label: 'Administrador de Horarios' },
    ];

    ngOnInit(): void {
        addIcons({
            addCircleOutline,
            calendarOutline,
            chevronBackOutline,
            chevronForwardOutline,
            createOutline,
            documentTextOutline,
            eyeOutline,
            funnelOutline,
            lockClosedOutline,
            lockOpenOutline,
            refreshOutline,
            searchOutline,
            settingsOutline,
            timeOutline,
            trashOutline,
        });

        this.realtimeSync.watchScopes([RealtimeScope.AuditLogs])
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.LoadAuditLogs(true));
    }

    ionViewWillEnter(): void {
        this.LoadAuditLogs();
    }

    LoadAuditLogs(forceRefresh = false): void {
        if (forceRefresh) {
            this.isLoaded = false;
        }

        const filter = this.buildFilter();

        this.apollo.query<{ GetAuditLogs: AuditLogPageResponse }>({
            query: GET_AUDIT_LOGS,
            variables: { filter },
            fetchPolicy: 'network-only',
        })
        .pipe(map((result) => result?.data?.GetAuditLogs ?? { items: [], totalCount: 0, page: this.page, limit: this.pageSize }))
        .subscribe({
            next: (page) => {
                this.auditLogs = page.items ?? [];
                this.totalCount = page.totalCount ?? 0;
                this.page = page.page ?? this.page;
                this.pageSize = page.limit ?? this.pageSize;
                this.isLoaded = true;
                this.cdr.detectChanges();
            },
            error: (error) => {
                console.error('Error al cargar registros de auditoría:', error);
                this.auditLogs = [];
                this.totalCount = 0;
                this.isLoaded = true;
                this.cdr.detectChanges();
            },
        });
    }

    OnSearchChange(event: Event): void {
        this.searchQuery = (event as CustomEvent<{ value?: string }>).detail?.value ?? '';
        this.page = 1;
        this.LoadAuditLogs(true);
    }

    OnFilterChange(): void {
        this.page = 1;
        this.LoadAuditLogs(true);
    }

    OnPageSizeChange(): void {
        this.page = 1;
        this.LoadAuditLogs(true);
    }

    PreviousPage(): void {
        if (this.page <= 1) {
            return;
        }

        this.page -= 1;
        this.LoadAuditLogs(true);
    }

    NextPage(): void {
        if (this.page >= this.totalPages) {
            return;
        }

        this.page += 1;
        this.LoadAuditLogs(true);
    }

    ClearFilters(): void {
        this.searchQuery = '';
        this.actionFilter = '';
        this.resourceFilter = '';
        this.actorRoleFilter = '';
        this.fromDate = '';
        this.toDate = '';
        this.page = 1;
        this.pageSize = 20;
        this.LoadAuditLogs(true);
    }

    get totalPages(): number {
        return Math.max(1, Math.ceil(this.totalCount / this.pageSize));
    }

    get displayRangeStart(): number {
        return this.totalCount === 0 ? 0 : ((this.page - 1) * this.pageSize) + 1;
    }

    get displayRangeEnd(): number {
        return Math.min(this.page * this.pageSize, this.totalCount);
    }

    get emptyTitle(): string {
        return this.hasFilters() ? 'No hay registros que coincidan con los filtros' : 'La bitácora aún no tiene registros';
    }

    get emptySubtitle(): string {
        return this.hasFilters()
            ? 'Ajusta los filtros o limpia la búsqueda para ver más eventos.'
            : 'Las acciones administrativas críticas aparecerán aquí una vez registradas.';
    }

    trackById(_: number, item: AuditLogRow): string {
        return item.id;
    }

    actionLabel(action: string): string {
        const found = this.actionOptions.find((option) => option.value === action);
        return found?.label ?? action.replace(/_/g, ' ');
    }

    resourceLabel(resourceType: string): string {
        const found = this.resourceOptions.find((option) => option.value === resourceType);
        return found?.label ?? resourceType.replace(/_/g, ' ');
    }

    iconForAction(action: string): string {
        if (action.startsWith('create_')) {
            return 'add-circle-outline';
        }

        if (action.startsWith('update_') || action.startsWith('set_')) {
            return 'create-outline';
        }

        if (action.startsWith('remove_')) {
            return 'trash-outline';
        }

        if (action.startsWith('disable_')) {
            return 'lock-closed-outline';
        }

        if (action.startsWith('reactivate_')) {
            return 'lock-open-outline';
        }

        if (action.startsWith('force_reset_')) {
            return 'refresh-outline';
        }

        return 'document-text-outline';
    }

    toneForAction(action: string): 'success' | 'warning' | 'danger' | 'primary' | 'medium' {
        if (action.startsWith('create_') || action.startsWith('reactivate_')) {
            return 'success';
        }

        if (action.startsWith('update_') || action.startsWith('set_') || action.startsWith('force_reset_')) {
            return 'warning';
        }

        if (action.startsWith('remove_') || action.startsWith('disable_')) {
            return 'danger';
        }

        return 'primary';
    }

    formatTimestamp(value: string): string {
        return new Intl.DateTimeFormat('es-MX', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(new Date(value));
    }

    formatDetails(details: Record<string, unknown> | null): string {
        if (!details || typeof details !== 'object') {
            return 'Sin detalles adicionales';
        }

        const entries = Object.entries(details)
            .filter(([, value]) => value !== null && value !== undefined && value !== '');

        if (entries.length === 0) {
            return 'Sin detalles adicionales';
        }

        return entries
            .map(([key, value]) => `${this.humanizeKey(key)}: ${this.formatValue(value)}`)
            .join(' · ');
    }

    private buildFilter(): AuditLogFilterInput {
        const filter: AuditLogFilterInput = {
            page: this.page,
            limit: this.pageSize,
        };

        if (this.searchQuery.trim()) {
            filter.search = this.searchQuery.trim();
        }

        if (this.actionFilter) {
            filter.action = this.actionFilter;
        }

        if (this.resourceFilter) {
            filter.resourceType = this.resourceFilter;
        }

        if (this.actorRoleFilter) {
            filter.actorRole = this.actorRoleFilter;
        }

        if (this.fromDate) {
            filter.fromDate = this.fromDate;
        }

        if (this.toDate) {
            filter.toDate = this.toDate;
        }

        return filter;
    }

    private hasFilters(): boolean {
        return Boolean(
            this.searchQuery.trim() ||
            this.actionFilter ||
            this.resourceFilter ||
            this.actorRoleFilter ||
            this.fromDate ||
            this.toDate
        );
    }

    private humanizeKey(key: string): string {
        return key.replace(/_/g, ' ');
    }

    private formatValue(value: unknown): string {
        if (Array.isArray(value)) {
            return value.join(', ');
        }

        if (typeof value === 'object') {
            return JSON.stringify(value);
        }

        return String(value);
    }
}