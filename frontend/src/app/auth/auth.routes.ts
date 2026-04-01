import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { ChangePasswordComponent } from './pages/change-password/change-password.component';

export const authRoutes: Routes = [
    {
        path: 'login',
        component: LoginComponent
    },
    {
        path: 'change-credentials',
        component: ChangePasswordComponent
    },
    {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full'
    }
];