import { Component, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';

@Component({
    selector: 'app-dashboard',
    template: `
        <ion-header>
            <ion-toolbar color="primary">
                <ion-title>EduSync Admin</ion-title>
                <ion-buttons slot="end">
                    <ion-button (click)="Logout()">
                        <ion-icon name="log-out-outline" slot="icon-only"></ion-icon>
                    </ion-button>
                </ion-buttons>
            </ion-toolbar>
        </ion-header>

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

    Logout() 
    {
        this.authService.Logout();
    }
}