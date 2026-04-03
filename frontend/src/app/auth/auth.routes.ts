import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { ChangePasswordComponent } from './pages/change-password/change-password.component';
import { GuestGuard } from '../core/guards/guest.guard';
import { AuthGuard } from '../core/guards/auth.guard';

export const authRoutes: Routes = [
    {
        path: 'login',
        component: LoginComponent,
        canActivate: [GuestGuard]
    },
    {
        path: 'change-credentials',
        component: ChangePasswordComponent,
        canActivate: [AuthGuard]
    },
    {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full'
    }
];