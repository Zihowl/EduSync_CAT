import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { Observable, map } from 'rxjs';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { MenuCardComponent, MenuCardData } from '../../../shared/components/menu-card/menu-card.component';
import {
    IonContent,
    IonGrid,
    IonRow,
    IonCol
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { settingsOutline, peopleOutline, logOutOutline, cloudUploadOutline, bookOutline, layersOutline, businessOutline, homeOutline, calendarOutline, shieldCheckmarkOutline, personCircleOutline } from 'ionicons/icons';

type Role = 'SUPER_ADMIN' | 'ADMIN_HORARIOS';

interface DashboardCard extends MenuCardData {
    roles: Role[];
}

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [
        CommonModule,
        IonContent,
        IonGrid,
        IonRow,
        IonCol,
        PageHeaderComponent,
        MenuCardComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrls: ['./dashboard.component.scss'],
    template: `
        <ng-container *ngIf="role$ | async as currentRole">
            <app-page-header
                title="Panel de control"
                [showStatusBadge]="true"
                [statusBadgeText]="getRoleLabel(currentRole)"
                [statusBadgeIcon]="getRoleIcon(currentRole)"
                [statusBadgeTone]="getRoleTone(currentRole)"
                [showMenuButton]="true"
                [menuItems]="headerMenuItems"
                menuButtonAriaLabel="Abrir menú"
                (menuItemSelected)="onHeaderMenuItem($event)"
            ></app-page-header>

            <ion-content class="ion-padding">
                <div class="dashboard-shell app-page-shell">
                    <ion-grid class="dashboard-grid">
                        <ion-row>
                            <ng-container *ngFor="let card of cards; trackBy: trackByTitle">
                                <ion-col *ngIf="card.roles.includes(currentRole)" size="12" size-md="6" size-lg="4">
                                    <app-menu-card [card]="card"></app-menu-card>
                                </ion-col>
                            </ng-container>
                        </ion-row>
                    </ion-grid>
                </div>
            </ion-content>
        </ng-container>
    `
})
export class DashboardComponent implements OnInit
{
    private authService = inject(AuthService);

    role$: Observable<Role | null> = this.authService.user$.pipe(map(u => (u?.role ?? null) as Role | null));
    readonly headerMenuItems = [
        { label: 'Cerrar sesión', value: 'logout', icon: 'log-out-outline', danger: true },
    ];

    cards: DashboardCard[] = [
        { title: 'Configuración', icon: 'settings-outline', route: '/admin/config', roles: ['SUPER_ADMIN'], description: 'Gestionar ciclo escolar y dominios.' },
        { title: 'Usuarios', icon: 'people-outline', route: '/admin/users', roles: ['SUPER_ADMIN'], description: 'Altas y bajas de administradores.' },
        { title: 'Horarios', icon: 'calendar-outline', route: '/admin/schedules', roles: ['ADMIN_HORARIOS'], description: 'Gestionar horarios de grupos y subgrupos.' },
        { title: 'Carga de Horarios', icon: 'cloud-upload-outline', route: '/admin/upload', roles: ['ADMIN_HORARIOS'], description: 'Importar archivos Excel masivos.' },
        { title: 'Docentes', icon: 'people-outline', route: '/admin/catalogs/teachers', roles: ['ADMIN_HORARIOS'], description: 'Catálogo de personal docente.' },
        { title: 'Materias', icon: 'book-outline', route: '/admin/catalogs/subjects', roles: ['ADMIN_HORARIOS'], description: 'Catálogo de materias.' },
        { title: 'Grupos', icon: 'layers-outline', route: '/admin/catalogs/groups', roles: ['ADMIN_HORARIOS'], description: 'Estructura de grupos y subgrupos.' },
        { title: 'Aulas', icon: 'business-outline', route: '/admin/catalogs/classrooms', roles: ['ADMIN_HORARIOS'], description: 'Espacios físicos y salones.' },
        { title: 'Edificios', icon: 'home-outline', route: '/admin/catalogs/buildings', roles: ['ADMIN_HORARIOS'], description: 'Infraestructura del plantel.' }
    ];

    ngOnInit() 
    {
        addIcons({ settingsOutline, peopleOutline, logOutOutline, cloudUploadOutline, bookOutline, layersOutline, businessOutline, homeOutline, calendarOutline, shieldCheckmarkOutline, personCircleOutline });
    }

    getRoleLabel(role: Role | null): string {
        switch (role) {
            case 'SUPER_ADMIN':
                return 'Super Admin';
            case 'ADMIN_HORARIOS':
                return 'Admin Horarios';
            default:
                return 'Sin rol';
        }
    }

    getRoleIcon(role: Role | null): string {
        switch (role) {
            case 'SUPER_ADMIN':
                return 'shield-checkmark-outline';
            case 'ADMIN_HORARIOS':
                return 'calendar-outline';
            default:
                return 'person-circle-outline';
        }
    }

    getRoleTone(role: Role | null): 'info' | 'success' | 'warning' {
        switch (role) {
            case 'SUPER_ADMIN':
                return 'info';
            case 'ADMIN_HORARIOS':
                return 'success';
            default:
                return 'warning';
        }
    }

    onHeaderMenuItem(item: { value: string }): void {
        if (item.value === 'logout') {
            this.Logout();
        }
    }

    trackByTitle(index: number, card: DashboardCard) { return card.title; }

    Logout() 
    { 
        this.authService.logout(); 
    }
}
