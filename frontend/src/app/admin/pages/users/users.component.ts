import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
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
    IonFabButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { personAddOutline, trashOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

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
        PageHeaderComponent
    ],
    template: `
        <app-page-header title="Gestión de Usuarios" [showBackButton]="true" backDefaultHref="/admin"></app-page-header>

        <ion-content class="ion-padding users-content">
            <div class="users-container">
                <ion-list inset="true">
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

                    <div *ngIf="users.length === 0" class="empty-state">
                        Cargando usuarios...
                    </div>
                </ion-list>

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
                                        *ngIf="adminForm.get('email')?.value && getEmailDomain()"
                                        [color]="isDomainAllowed() ? 'success' : 'danger'"
                                        class="ion-padding-start ion-margin-top">
                                        <small>{{ isDomainAllowed() ? 'Dominio permitido' : 'Dominio NO permitido — registra el dominio en Configuración' }}</small>
                                    </ion-note>
                                </div>

                                <ion-button
                                    expand="block"
                                    type="submit"
                                    [disabled]="adminForm.invalid || isLoading || (adminForm.get('email')?.value && !isDomainAllowed())">
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

    users: any[] = [];
    allowedDomains: string[] = [];
    isModalOpen = false;
    isLoading = false;
    adminForm: FormGroup = this.fb.group({
        fullName: ['', [Validators.required, Validators.minLength(3)]],
        email: ['', [Validators.required, Validators.email]]
    });

    ngOnInit() 
    {
        addIcons({ personAddOutline, trashOutline, shieldCheckmarkOutline });
        this.LoadUsers();
        this.LoadAllowedDomains();
    }

    LoadAllowedDomains()
    {
        this.apollo.watchQuery<any>({ query: GET_ALLOWED_DOMAINS, fetchPolicy: 'network-only' })
        .valueChanges.subscribe({
            next: (res: any) => {
                const data = res?.data;
                if (!data)
                {
                    console.error('GetAllowedDomains returned no data for users:', res);
                    this.allowedDomains = [];
                    return;
                }

                this.allowedDomains = (data.GetAllowedDomains ?? []).map((d: any) => d.domain.toLowerCase());
            },
            error: (err) => {
                console.error('GetAllowedDomains network/error (users):', err);
                this.allowedDomains = [];
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
        return this.allowedDomains.includes(d);
    }

    LoadUsers() 
    {
        this.apollo.watchQuery<any>({ query: GET_USERS, fetchPolicy: 'network-only' })
        .valueChanges.subscribe({
            next: (res: any) => {
                const data = res?.data;
                if (!data)
                {
                    console.error('GetUsers returned no data:', res);
                    this.users = [];
                    return;
                }

                this.users = data.GetUsers ?? [];
            },
            error: (err) => {
                console.error('GetUsers network/error:', err);
                this.users = [];
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
            refetchQueries: [{ query: GET_USERS }]
        }).subscribe({
          next: () =>
          {
                this.isLoading = false;
                this.SetOpen(false);
                alert('Usuario creado con éxito.\nRevisa la consola del servidor para ver la contraseña temporal.');
            },
          error: (err) =>
          {
                this.isLoading = false;
                const msg = err.graphQLErrors?.[0]?.message || err.message;
                alert('Error: ' + msg);
            }
        });
    }
}
