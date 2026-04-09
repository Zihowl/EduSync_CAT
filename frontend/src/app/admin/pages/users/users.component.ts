import { Component, OnInit, ChangeDetectorRef, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import {
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonItem,
    IonLabel,
    IonButton,
    IonIcon,
    IonModal,
    IonInput,
    IonNote,
    IonBadge,
    IonFab,
    IonFabButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { personAddOutline, personOutline, shieldCheckmarkOutline, lockClosedOutline, lockOpenOutline, refreshOutline } from 'ionicons/icons';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataListComponent } from '../../../shared/components/data-list/data-list.component';
import { NotificationService } from '../../../shared/services/notification.service';
import { DestroyRef } from '@angular/core';
import { RealtimeScope, RealtimeSyncService } from '../../../core/services/realtime-sync.service';
import { RealtimeQueryCacheService } from '../../../core/services/realtime-query-cache.service';

interface AdminUserRow {
    id: string;
    fullName: string | null;
    email: string;
    role: string;
    isActive: boolean;
    isTempPassword: boolean;
}

const GET_USERS = gql`
    query GetUsers {
        GetUsers {
            id
            fullName
            email
            role
            isActive
            isTempPassword
        }
    }
`;

const CREATE_ADMIN = gql`
    mutation CreateAdmin($input: CreateAdminInput!) {
        CreateAdmin(input: $input) {
            id
            email
        }
    }
`;

const DISABLE_ADMIN_ACCESS = gql`
    mutation DisableAdminAccess($userId: ID!) {
        DisableAdminAccess(userId: $userId) {
            id
            isActive
            isTempPassword
        }
    }
`;

const REACTIVATE_ADMIN_ACCESS = gql`
    mutation ReactivateAdminAccess($userId: ID!) {
        ReactivateAdminAccess(userId: $userId) {
            id
            isActive
            isTempPassword
        }
    }
`;

const FORCE_RESET_ADMIN_PASSWORD = gql`
    mutation ForceResetAdminPassword($userId: ID!) {
        ForceResetAdminPassword(userId: $userId) {
            id
            isActive
            isTempPassword
        }
    }
`;

const GET_ALLOWED_DOMAINS = gql`
    query GetAllowedDomains {
        GetAllowedDomains {
            domain
        }
    }
`;

@Component({
    selector: 'app-users',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        IonContent,
        IonHeader,
        IonToolbar,
        IonTitle,
        IonButtons,
        IonItem,
        IonLabel,
        IonButton,
        IonIcon,
        IonModal,
        IonInput,
        IonNote,
        IonBadge,
        IonFab,
        IonFabButton,
        PageHeaderComponent,
        DataListComponent
    ],
    template: `
        <app-page-header title="Gestión de Usuarios" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding users-content">
            <div class="users-container app-page-shell app-page-shell--medium">
                <app-data-list
                    [items]="users"
                    [loaded]="isUsersLoaded"
                    loadingText="Cargando usuarios..."
                    emptyTitle="No hay usuarios registrados"
                    emptySubtitle="Usa el botón + para crear el primer administrador.">
                    <ng-template #itemTemplate let-u>
                        <ion-item class="user-item" lines="none">
                            <ion-icon
                                slot="start"
                                class="user-role-icon"
                                [class.user-role-icon--super]="u.role === 'SUPER_ADMIN'"
                                [class.user-role-icon--admin]="u.role !== 'SUPER_ADMIN'"
                                [name]="u.role === 'SUPER_ADMIN' ? 'shield-checkmark-outline' : 'person-outline'"
                                [attr.aria-label]="u.role === 'SUPER_ADMIN' ? 'Súper administrador' : 'Administrador de horarios'">
                            </ion-icon>
                            <ion-label class="user-info">
                                <h2>{{ u.fullName || 'Sin Nombre' }}</h2>
                                <p>{{ u.email }}</p>
                                <div class="user-badges">
                                    <ion-badge [color]="u.isActive ? 'success' : 'medium'">
                                        {{ u.isActive ? 'Activo' : 'Inhabilitado' }}
                                    </ion-badge>
                                    <ion-badge *ngIf="u.isTempPassword" color="warning">
                                        Temporal
                                    </ion-badge>
                                </div>
                            </ion-label>
                            <div *ngIf="canManageAccess(u)" slot="end" class="user-actions">
                                <ion-button
                                    size="small"
                                    fill="outline"
                                    [color]="u.isActive ? 'warning' : 'success'"
                                    (click)="toggleAdminAccess(u)"
                                    [disabled]="isActionLoading">
                                    <ion-icon [name]="u.isActive ? 'lock-closed-outline' : 'lock-open-outline'" slot="start"></ion-icon>
                                    {{ u.isActive ? 'Inhabilitar' : 'Reactivar' }}
                                </ion-button>

                                <ion-button
                                    size="small"
                                    fill="outline"
                                    color="medium"
                                    (click)="forceResetAdminPassword(u)"
                                    [disabled]="isActionLoading">
                                    <ion-icon name="refresh-outline" slot="start"></ion-icon>
                                    Restablecer
                                </ion-button>
                            </div>
                        </ion-item>
                    </ng-template>
                </app-data-list>

                <ion-fab vertical="bottom" horizontal="end" slot="fixed">
                    <ion-fab-button (click)="SetOpen(true)">
                        <ion-icon name="person-add-outline"></ion-icon>
                    </ion-fab-button>
                </ion-fab>

                <ion-modal class="audit-glass-modal" [isOpen]="isModalOpen" (willDismiss)="SetOpen(false)">
                    <ng-template>
                        <ion-header>
                            <ion-toolbar>
                                <ion-title>Nuevo Administrador</ion-title>
                                <ion-buttons slot="end">
                                    <ion-button (click)="SetOpen(false)">Cancelar</ion-button>
                                </ion-buttons>
                            </ion-toolbar>
                        </ion-header>
                        <ion-content class="ion-padding">
                            <form [formGroup]="adminForm" (ngSubmit)="CreateUser()">
                                <div class="form-group">
                                    <ion-input
                                        label="Nombre Completo"
                                        label-placement="floating"
                                        fill="outline"
                                        formControlName="fullName">
                                    </ion-input>
                                </div>

                                <div class="form-group">
                                    <ion-input
                                        label="Correo Institucional"
                                        label-placement="floating"
                                        fill="outline"
                                        formControlName="email"
                                        type="email"
                                        placeholder="usuario@dominio.edu.mx">
                                    </ion-input>
                                    <ion-note color="medium" class="ion-padding-start">
                                        <small>El dominio debe estar permitido en Configuración.</small>
                                    </ion-note>

                                    <ion-note
                                        *ngIf="isAllowedDomainsLoaded && adminForm.get('email')?.value && getEmailDomain()"
                                        [color]="isDomainAllowed() ? 'success' : 'danger'"
                                        class="ion-padding-start ion-margin-top">
                                        <small>{{ isDomainAllowed() ? 'Dominio permitido' : 'Dominio NO permitido — registra el dominio en Configuración' }}</small>
                                    </ion-note>
                                </div>

                                <ion-button
                                    expand="block"
                                    type="submit"
                                    [disabled]="adminForm.invalid || isLoading || (isAllowedDomainsLoaded && adminForm.get('email')?.value && !isDomainAllowed())">
                                    {{ isLoading ? 'Registrando...' : 'Registrar Usuario' }}
                                </ion-button>
                            </form>
                        </ion-content>
                    </ng-template>
                </ion-modal>
            </div>
        </ion-content>
    `,
    styleUrls: ['./users.component.scss']
})
export class UsersComponent implements OnInit
{
    private apollo = inject(Apollo);
    private fb = inject(FormBuilder);
    private cdr = inject(ChangeDetectorRef);
    private ngZone = inject(NgZone);
    private destroyRef = inject(DestroyRef);
    private realtimeSync = inject(RealtimeSyncService);
    private queryCache = inject(RealtimeQueryCacheService);
    private notifications = inject(NotificationService);

    users: AdminUserRow[] = [];
    allowedDomains: string[] = [];
    isModalOpen = false;
    isLoading = false;
    isActionLoading = false;
    isUsersLoaded = false;
    isAllowedDomainsLoaded = false;
    adminForm: FormGroup = this.fb.group({
        fullName: ['', [Validators.required, Validators.minLength(3)]],
        email: ['', [Validators.required, Validators.email]]
    });

    private runInZone(action: () => void): void
    {
        this.ngZone.run(action);
    }

    ngOnInit() 
    {
        addIcons({ personAddOutline, personOutline, shieldCheckmarkOutline, lockClosedOutline, lockOpenOutline, refreshOutline });
        this.setupRealtimeRefresh();
    }

    ionViewWillEnter(): void
    {
        this.LoadUsers();
        this.LoadAllowedDomains();
    }

    LoadAllowedDomains(forceRefresh: boolean = false)
    {
        const loadAllowedDomains = () => this.apollo.query<any>({ query: GET_ALLOWED_DOMAINS, fetchPolicy: 'network-only' }).pipe(
            map((res: any) => (res?.data?.GetAllowedDomains ?? []).map((d: any) => d.domain.toLowerCase()))
        );

        const request$ = forceRefresh
            ? this.queryCache.refresh(
                'admin-users-allowed-domains',
                [RealtimeScope.AllowedDomains],
                loadAllowedDomains
            )
            : this.queryCache.load(
                'admin-users-allowed-domains',
                [RealtimeScope.AllowedDomains],
                loadAllowedDomains
            );

        request$
        .subscribe({
            next: (domains: string[]) => {
                this.runInZone(() => {
                    this.allowedDomains = domains;
                    this.isAllowedDomainsLoaded = true;
                    this.cdr.detectChanges();
                });
            },
            error: (err) => {
                this.runInZone(() => {
                    console.error('Error de red al obtener dominios permitidos (usuarios):', err);
                    this.isAllowedDomainsLoaded = true;
                    this.cdr.detectChanges();
                });
            }
        });
    }

    getEmailDomain(): string | null
    {
        const email = this.adminForm.get('email')?.value;
      if (!email || !email.includes('@'))
      {
        return null;
      }
        return email.split('@')[1].toLowerCase();
    }

    isDomainAllowed(): boolean
    {
        const d = this.getEmailDomain();
        if (!d)
        {
            return true;
        }

        if (!this.isAllowedDomainsLoaded)
        {
            return true;
        }

        return this.allowedDomains.includes(d);
    }

    LoadUsers(forceRefresh: boolean = false) 
    {
        const loadUsers = () => this.apollo.query<any>({ query: GET_USERS, fetchPolicy: 'network-only' }).pipe(
            map((res: any) => this.sortUsers(res?.data?.GetUsers ?? []))
        );

        const request$ = forceRefresh
            ? this.queryCache.refresh(
                'admin-users-list',
                [RealtimeScope.Users],
                loadUsers
            )
            : this.queryCache.load(
                'admin-users-list',
                [RealtimeScope.Users],
                loadUsers
            );

        request$
        .subscribe({
            next: (users: AdminUserRow[]) => {
                this.runInZone(() => {
                    this.users = users;
                    this.isUsersLoaded = true;
                    this.cdr.detectChanges();
                });
            },
            error: (err) => {
                this.runInZone(() => {
                    console.error('Error de red al obtener usuarios:', err);
                    this.isUsersLoaded = true;
                    this.cdr.detectChanges();
                });
            }
        });
    }

    private sortUsers(users: AdminUserRow[]): AdminUserRow[] {
        return [...users]
            .map((user, index) => ({ user, index }))
            .sort((left, right) => {
                const rolePriority = Number(right.user.role === 'SUPER_ADMIN') - Number(left.user.role === 'SUPER_ADMIN');

                if (rolePriority !== 0) {
                    return rolePriority;
                }

                return left.index - right.index;
            })
            .map(({ user }) => user);
    }

    SetOpen(isOpen: boolean) 
    {
        this.isModalOpen = isOpen;
      if (!isOpen)
      {
        this.adminForm.reset();
      }
    }


    canManageAccess(user: AdminUserRow): boolean {
        return user.role === 'ADMIN_HORARIOS';
    }

    async toggleAdminAccess(user: AdminUserRow): Promise<void> {
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
            user.isActive ? DISABLE_ADMIN_ACCESS : REACTIVATE_ADMIN_ACCESS,
            `${actionLabel} usuario con éxito.`
        );
    }

    async forceResetAdminPassword(user: AdminUserRow): Promise<void> {
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
            FORCE_RESET_ADMIN_PASSWORD,
            'Contraseña temporal regenerada. Revisa la consola del servidor.'
        );
    }

    private executeUserAction(user: AdminUserRow, mutation: any, successMessage: string): void {
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
    CreateUser() 
    {
      if (this.adminForm.invalid)
      {
        return;
      }

        this.isLoading = true;
        const input = this.adminForm.value;

        this.apollo.mutate({
            mutation: CREATE_ADMIN,
            variables: { input },
        }).subscribe({
          next: () =>
          {
                this.runInZone(() => {
                    this.isLoading = false;
                    this.SetOpen(false);
                    this.cdr.detectChanges();
                    this.notifications.success(
                        'Usuario creado con éxito.\nRevisa la consola del servidor para ver la contraseña temporal.',
                        'Usuario creado'
                    );
                });
                this.LoadUsers(true);
            },
          error: (err) =>
          {
                this.runInZone(() => {
                    this.isLoading = false;
                    this.cdr.detectChanges();
                    const msg = err.graphQLErrors?.[0]?.message || err.message;
                    this.notifications.danger('Error: ' + msg);
                });
            }
        });
    }

    private setupRealtimeRefresh(): void
    {
        this.realtimeSync.watchScopes([RealtimeScope.Users, RealtimeScope.AllowedDomains])
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                this.LoadUsers(true);
                this.LoadAllowedDomains(true);
            });
    }
}
