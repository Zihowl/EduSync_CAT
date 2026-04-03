import { Component, inject, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

@Component({
    selector: 'app-dashboard',
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    standalone: true,
    imports: [PageHeaderComponent],
    template: `
        <app-page-header
            title="EduSync Admin"
            [showMenuButton]="true"
            [menuItems]="headerMenuItems"
            menuButtonAriaLabel="Abrir menú"
            (menuItemSelected)="onHeaderMenuItem($event)"
        ></app-page-header>

        <ion-content class="ion-padding">
            <div class="container">
                <h1>Welcome, Super Admin</h1>
                <p>Status: <span class="badge bg-success">Authenticated</span></p>

                <div class="card mt-4">
                    <div class="card-body">
                        <h5 class="card-title">Quick Actions</h5>
                        <div class="d-grid gap-2 d-md-block">
                            <button class="btn btn-outline-primary me-2">Manage Users</button>
                            <button class="btn btn-outline-primary">System Config</button>
                        </div>
                    </div>
                </div>
            </div>
        </ion-content>
    `,
    styles: []
})
export class DashboardComponent
{
    private authService = inject(AuthService);
    readonly headerMenuItems = [
        { label: 'Cerrar sesión', value: 'logout', icon: 'log-out-outline', danger: true },
    ];

    onHeaderMenuItem(item: { value: string }): void {
        if (item.value === 'logout') {
            this.Logout();
        }
    }

    Logout() 
    {
        this.authService.logout();
    }
}