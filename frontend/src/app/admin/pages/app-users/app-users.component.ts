import { Component, OnInit, ChangeDetectorRef, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import {
    IonContent,
    IonItem,
    IonLabel,
    IonButton,
    IonIcon,
    IonBadge,
    IonSegment,
    IonSegmentButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { schoolOutline, briefcaseOutline, lockClosedOutline, lockOpenOutline, refreshOutline, personOutline } from 'ionicons/icons';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataListComponent } from '../../../shared/components/data-list/data-list.component';
import { NotificationService } from '../../../shared/services/notification.service';
import { DestroyRef } from '@angular/core';
import { RealtimeScope, RealtimeSyncService } from '../../../core/services/realtime-sync.service';
import { RealtimeQueryCacheService } from '../../../core/services/realtime-query-cache.service';

interface AppUserRow {
    id: string;
    fullName: string | null;
    username: string | null;
    email: string;
    role: 'STUDENT' | 'TEACHER' | string;
    isActive: boolean;
    isTempPassword: boolean;
}

type AppUserTab = 'STUDENT' | 'TEACHER';

const APP_USER_ROLES = ['STUDENT', 'TEACHER'];

const GET_APP_USERS = gql`
    query GetUsers($roles: [String!]) {
        GetUsers(roles: $roles) {
            id
            fullName
            username
            email
            role
            isActive
            isTempPassword
        }
    }
`;

const DISABLE_APP_USER_ACCESS = gql`
    mutation DisableAppUserAccess($userId: ID!) {
        DisableAppUserAccess(userId: $userId) {
            id
            isActive
            isTempPassword
        }
    }
`;

const REACTIVATE_APP_USER_ACCESS = gql`
    mutation ReactivateAppUserAccess($userId: ID!) {
        ReactivateAppUserAccess(userId: $userId) {
            id
            isActive
            isTempPassword
        }
    }
`;

const FORCE_RESET_APP_USER_PASSWORD = gql`
    mutation ForceResetAppUserPassword($userId: ID!) {
        ForceResetAppUserPassword(userId: $userId) {
            id
            isActive
            isTempPassword
        }
    }
`;

@Component({
    selector: 'app-app-users',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        IonContent,
        IonItem,
        IonLabel,
        IonButton,
        IonIcon,
        IonBadge,
        IonSegment,
        IonSegmentButton,
        PageHeaderComponent,
        DataListComponent
    ],
    template: `
        <app-page-header title="Usuarios" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding users-content">
            <div class="users-container app-page-shell app-page-shell--medium">
                <ion-segment [(ngModel)]="activeTab" (ionChange)="onTabChange()" class="app-users-segment">
                    <ion-segment-button value="STUDENT">
                        <ion-label>Alumnos</ion-label>
                    </ion-segment-button>
                    <ion-segment-button value="TEACHER">
                        <ion-label>Maestros</ion-label>
                    </ion-segment-button>
                </ion-segment>

                <app-data-list
                    [items]="filteredUsers"
                    [loaded]="isUsersLoaded"
                    loadingText="Cargando usuarios..."
                    [emptyTitle]="activeTab === 'STUDENT' ? 'No hay alumnos registrados' : 'No hay maestros registrados'"
                    emptySubtitle="Los usuarios se autorregistran desde la app DOG.">
                    <ng-template #itemTemplate let-u>
                        <ion-item class="user-item" lines="none">
                            <div class="user-body">
                                <div class="user-info">
                                    <div class="user-title-row">
                                        <ion-icon
                                            class="user-role-icon"
                                            [class.user-role-icon--student]="u.role === 'STUDENT'"
                                            [class.user-role-icon--teacher]="u.role === 'TEACHER'"
                                            [name]="u.role === 'TEACHER' ? 'briefcase-outline' : 'school-outline'"
                                            [attr.aria-label]="u.role === 'TEACHER' ? 'Maestro' : 'Alumno'">
                                        </ion-icon>
                                        <h2>{{ u.fullName || 'Sin Nombre' }}</h2>
                                    </div>
                                    <p>{{ u.email }}</p>
                                    @if (u.username) {
                                        <p class="user-handle">{{ '@' + u.username }}</p>
                                    }
                                    <div class="user-badges">
                                        <ion-badge [color]="u.isActive ? 'success' : 'medium'">
                                            {{ u.isActive ? 'Activo' : 'Inhabilitado' }}
                                        </ion-badge>
                                        <ion-badge *ngIf="u.isTempPassword" color="warning">
                                            Temporal
                                        </ion-badge>
                                    </div>
                                </div>

                                <div class="user-actions">
                                    <ion-button
                                        class="user-action-button"
                                        size="small"
                                        fill="outline"
                                        [color]="u.isActive ? 'warning' : 'success'"
                                        (click)="toggleAccess(u)"
                                        [disabled]="isActionLoading">
                                        <ion-icon [name]="u.isActive ? 'lock-closed-outline' : 'lock-open-outline'" slot="start"></ion-icon>
                                        {{ u.isActive ? 'Inhabilitar' : 'Reactivar' }}
                                    </ion-button>

                                    <ion-button
                                        class="user-action-button"
                                        size="small"
                                        fill="outline"
                                        color="medium"
                                        (click)="forceResetPassword(u)"
                                        [disabled]="isActionLoading">
                                        <ion-icon name="refresh-outline" slot="start"></ion-icon>
                                        Restablecer
                                    </ion-button>
                                </div>
                            </div>
                        </ion-item>
                    </ng-template>
                </app-data-list>
            </div>
        </ion-content>
    `,
    styleUrls: ['./app-users.component.scss']
})
export class AppUsersComponent implements OnInit {
    private apollo = inject(Apollo);
    private cdr = inject(ChangeDetectorRef);
    private ngZone = inject(NgZone);
    private destroyRef = inject(DestroyRef);
    private realtimeSync = inject(RealtimeSyncService);
    private queryCache = inject(RealtimeQueryCacheService);
    private notifications = inject(NotificationService);

    users: AppUserRow[] = [];
    activeTab: AppUserTab = 'STUDENT';
    isUsersLoaded = false;
    isActionLoading = false;

    get filteredUsers(): AppUserRow[] {
        return this.users.filter(u => u.role === this.activeTab);
    }

    private runInZone(action: () => void): void {
        this.ngZone.run(action);
    }

    ngOnInit() {
        addIcons({ schoolOutline, briefcaseOutline, lockClosedOutline, lockOpenOutline, refreshOutline, personOutline });
        this.setupRealtimeRefresh();
    }

    ionViewWillEnter(): void {
        this.LoadUsers();
    }

    ionViewWillLeave(): void {
        this.isUsersLoaded = true;
        this.cdr.detectChanges();
    }

    onTabChange(): void {
        this.cdr.detectChanges();
    }

    LoadUsers(forceRefresh: boolean = false) {
        const loadUsers = () => this.apollo.query<any>({
            query: GET_APP_USERS,
            variables: { roles: APP_USER_ROLES },
            fetchPolicy: 'network-only'
        }).pipe(
            map((res: any) => (res?.data?.GetUsers ?? []) as AppUserRow[])
        );

        const request$ = forceRefresh
            ? this.queryCache.refresh(
                'admin-app-users-list',
                [RealtimeScope.Users],
                loadUsers
            )
            : this.queryCache.load(
                'admin-app-users-list',
                [RealtimeScope.Users],
                loadUsers
            );

        request$.subscribe({
            next: (users: AppUserRow[]) => {
                this.runInZone(() => {
                    this.users = users;
                    this.isUsersLoaded = true;
                    this.cdr.detectChanges();
                });
            },
            error: (err) => {
                this.runInZone(() => {
                    console.error('Error de red al obtener usuarios de app:', err);
                    this.isUsersLoaded = true;
                    this.cdr.detectChanges();
                });
            }
        });
    }

    async toggleAccess(user: AppUserRow): Promise<void> {
        const actionLabel = user.isActive ? 'Inhabilitar' : 'Reactivar';
        const message = user.isActive
            ? `¿Inhabilitar el acceso de ${user.fullName || user.email}?`
            : `¿Reactivar el acceso de ${user.fullName || user.email}?`;

        if (!(await this.notifications.confirm({
            title: 'Confirmar cambio de acceso',
            message,
            confirmText: actionLabel,
            cancelText: 'Cancelar',
            confirmColor: user.isActive ? 'warning' : 'success',
            styleType: 'warning'
        }))) {
            return;
        }

        this.executeUserAction(
            user,
            user.isActive ? DISABLE_APP_USER_ACCESS : REACTIVATE_APP_USER_ACCESS,
            `${actionLabel} usuario con éxito.`
        );
    }

    async forceResetPassword(user: AppUserRow): Promise<void> {
        if (!(await this.notifications.confirm({
            title: 'Confirmar restablecimiento',
            message: `¿Forzar el restablecimiento de contraseña de ${user.fullName || user.email}?`,
            confirmText: 'Restablecer',
            cancelText: 'Cancelar',
            confirmColor: 'danger',
            styleType: 'danger'
        }))) {
            return;
        }

        this.executeUserAction(
            user,
            FORCE_RESET_APP_USER_PASSWORD,
            'Contraseña temporal regenerada. Revisa el correo y la consola del servidor.'
        );
    }

    private executeUserAction(user: AppUserRow, mutation: any, successMessage: string): void {
        this.isActionLoading = true;

        this.apollo.mutate({
            mutation,
            variables: { userId: user.id },
        }).subscribe({
            next: () => {
                this.runInZone(() => {
                    this.isActionLoading = false;
                    this.cdr.detectChanges();
                    this.notifications.success(successMessage);
                });
                this.LoadUsers(true);
            },
            error: (err) => {
                this.runInZone(() => {
                    this.isActionLoading = false;
                    this.cdr.detectChanges();
                    const msg = err.graphQLErrors?.[0]?.message || err.message;
                    this.notifications.danger('Error: ' + msg);
                });
            }
        });
    }

    private setupRealtimeRefresh(): void {
        this.realtimeSync.watchScopes([RealtimeScope.Users])
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                this.LoadUsers(true);
            });
    }
}
