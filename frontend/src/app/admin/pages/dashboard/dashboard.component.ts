import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { RouterModule } from '@angular/router';
import { Observable, map } from 'rxjs';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import {
    IonContent,
    IonIcon,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonGrid,
    IonRow,
    IonCol
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { settingsOutline, peopleOutline, logOutOutline, cloudUploadOutline, bookOutline, layersOutline, businessOutline, homeOutline, calendarOutline, shieldCheckmarkOutline, personCircleOutline } from 'ionicons/icons';

type Role = 'SUPER_ADMIN' | 'ADMIN_HORARIOS';
interface Card { title: string; icon: string; route: string; color?: string; roles: Role[]; desc: string; }

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        IonContent,
        IonIcon,
        IonCard,
        IonCardHeader,
        IonCardTitle,
        IonCardContent,
        IonGrid,
        IonRow,
        IonCol,
        PageHeaderComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <ng-container *ngIf="role$ | async as currentRole">
            <app-page-header
                title="EduSync Admin"
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
                <ion-grid class="ion-margin-top">
                    <ion-row>
                        <ion-col size="12" size-md="6">
                            <h1 class="dashboard-title">Panel de Control</h1>
                        </ion-col>
                    </ion-row>

                    <ion-row>
                        <ng-container *ngFor="let card of cards; trackBy: trackByTitle">
                            <ion-col *ngIf="card.roles.includes(currentRole)" size="12" size-md="6">
                                <ion-card button [routerLink]="card.route" class="dashboard-card" [color]="card.color">
                                    <ion-card-header>
                                        <ion-card-title>
                                            <ion-icon [name]="card.icon" class="dashboard-icon"></ion-icon>
                                            {{ card.title }}
                                        </ion-card-title>
                                    </ion-card-header>
                                    <ion-card-content>
                                        {{ card.desc }}
                                    </ion-card-content>
                                </ion-card>
                            </ion-col>
                        </ng-container>
                    </ion-row>
                </ion-grid>
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

    cards: Card[] = [
        { title: 'Configuración', icon: 'settings-outline', route: '/admin/config', roles: ['SUPER_ADMIN'], desc: 'Gestionar ciclo escolar y dominios.' },
        { title: 'Usuarios', icon: 'people-outline', route: '/admin/users', roles: ['SUPER_ADMIN'], desc: 'Altas y bajas de administradores.' },
        { title: 'Horarios', icon: 'calendar-outline', route: '/admin/schedules', color: 'success', roles: ['ADMIN_HORARIOS'], desc: 'Gestionar horarios de grupos y subgrupos.' },
        { title: 'Carga de Horarios', icon: 'cloud-upload-outline', route: '/admin/upload', color: 'tertiary', roles: ['ADMIN_HORARIOS'], desc: 'Importar archivos Excel masivos.' },
        { title: 'Docentes', icon: 'people-outline', route: '/admin/catalogs/teachers', color: 'light', roles: ['ADMIN_HORARIOS'], desc: 'Catálogo de personal docente.' },
        { title: 'Materias', icon: 'book-outline', route: '/admin/catalogs/subjects', color: 'light', roles: ['ADMIN_HORARIOS'], desc: 'Catálogo de materias.' },
        { title: 'Grupos', icon: 'layers-outline', route: '/admin/catalogs/groups', color: 'light', roles: ['ADMIN_HORARIOS'], desc: 'Estructura de grupos y subgrupos.' },
        { title: 'Aulas', icon: 'business-outline', route: '/admin/catalogs/classrooms', color: 'light', roles: ['ADMIN_HORARIOS'], desc: 'Espacios físicos y salones.' },
        { title: 'Edificios', icon: 'home-outline', route: '/admin/catalogs/buildings', color: 'light', roles: ['ADMIN_HORARIOS'], desc: 'Infraestructura del plantel.' }
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

    trackByTitle(index: number, card: Card) { return card.title; }

    Logout() 
    { 
        this.authService.logout(); 
    }
}
