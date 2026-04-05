import { Component, OnInit, ChangeDetectorRef, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonList,
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
    IonSpinner
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { personAddOutline, trashOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DestroyRef } from '@angular/core';
import { RealtimeScope, RealtimeSyncService } from '../../../core/services/realtime-sync.service';

const GET_USERS = gql`
    query GetUsers {
        GetUsers {
            id
            fullName
            email
            role
            isActive
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
        IonList,
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
        IonSpinner,
        PageHeaderComponent
    ],
    template: `
        <app-page-header title="Gestión de Usuarios" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding users-content">
            <div class="users-container">
                <ng-container *ngIf="isUsersLoaded; else usersLoading">
                    <ion-list inset="true" *ngIf="users.length > 0; else noUsers">
                        <ion-item *ngFor="let u of users">
                            <ion-icon slot="start" name="shield-checkmark-outline" color="medium"></ion-icon>
                            <ion-label>
                                <h2>{{ u.fullName || 'Sin Nombre' }}</h2>
                                <p>{{ u.email }}</p>
                            </ion-label>
                            <ion-badge slot="end" [color]="u.isActive ? 'success' : 'medium'">
                                {{ u.role }}
                            </ion-badge>
                        </ion-item>
                    </ion-list>

                    <ng-template #noUsers>
                        <div class="empty-state">
                            <p>No hay usuarios registrados</p>
                            <small>Usa el botón + para crear el primer administrador.</small>
                        </div>
                    </ng-template>
                </ng-container>

                <ng-template #usersLoading>
                    <div class="users-loading-state">
                        <ion-spinner name="crescent"></ion-spinner>
                        <p>Cargando usuarios...</p>
                    </div>
                </ng-template>

                <ion-fab vertical="bottom" horizontal="end" slot="fixed">
                    <ion-fab-button (click)="SetOpen(true)">
                        <ion-icon name="person-add-outline"></ion-icon>
                    </ion-fab-button>
                </ion-fab>

                <ion-modal [isOpen]="isModalOpen" (willDismiss)="SetOpen(false)">
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

    users: any[] = [];
    allowedDomains: string[] = [];
    isModalOpen = false;
    isLoading = false;
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
        addIcons({ personAddOutline, trashOutline, shieldCheckmarkOutline });
        this.setupRealtimeRefresh();
    }

    ionViewWillEnter(): void
    {
        this.LoadUsers();
        this.LoadAllowedDomains();
    }

    LoadAllowedDomains()
    {
        this.apollo.query<any>({ query: GET_ALLOWED_DOMAINS, fetchPolicy: 'network-only' })
        .subscribe({
            next: (res: any) => {
                this.runInZone(() => {
                    const data = res?.data;
                    if (!data)
                    {
                        console.error('GetAllowedDomains returned no data for users:', res);
                        this.isAllowedDomainsLoaded = true;
                        this.cdr.detectChanges();
                        return;
                    }

                    this.allowedDomains = (data.GetAllowedDomains ?? []).map((d: any) => d.domain.toLowerCase());
                    this.isAllowedDomainsLoaded = true;
                    this.cdr.detectChanges();
                });
            },
            error: (err) => {
                this.runInZone(() => {
                    console.error('GetAllowedDomains network/error (users):', err);
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

    LoadUsers() 
    {
        this.apollo.query<any>({ query: GET_USERS, fetchPolicy: 'network-only' })
        .subscribe({
            next: (res: any) => {
                this.runInZone(() => {
                    const data = res?.data;
                    if (!data)
                    {
                        console.error('GetUsers returned no data:', res);
                        this.isUsersLoaded = true;
                        this.cdr.detectChanges();
                        return;
                    }

                    this.users = data.GetUsers ?? [];
                    this.isUsersLoaded = true;
                    this.cdr.detectChanges();
                });
            },
            error: (err) => {
                this.runInZone(() => {
                    console.error('GetUsers network/error:', err);
                    this.isUsersLoaded = true;
                    this.cdr.detectChanges();
                });
            }
        });
    }

    SetOpen(isOpen: boolean) 
    {
        this.isModalOpen = isOpen;
      if (!isOpen)
      {
        this.adminForm.reset();
      }
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
                    alert('Usuario creado con éxito.\nRevisa la consola del servidor para ver la contraseña temporal.');
                });
                this.LoadUsers();
            },
          error: (err) =>
          {
                this.runInZone(() => {
                    this.isLoading = false;
                    this.cdr.detectChanges();
                    const msg = err.graphQLErrors?.[0]?.message || err.message;
                    alert('Error: ' + msg);
                });
            }
        });
    }

    private setupRealtimeRefresh(): void
    {
        this.realtimeSync.watchScopes([RealtimeScope.Users, RealtimeScope.AllowedDomains])
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                this.LoadUsers();
                this.LoadAllowedDomains();
            });
    }
}
