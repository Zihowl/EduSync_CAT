import { Routes } from '@angular/router';

export const routes: Routes = [
    {
        path: 'auth',
        loadChildren: () =>
            import('./auth/auth.routes').then(m => m.authRoutes)
    },
    {
        path: 'admin',
        loadChildren: () =>
            import('./admin/admin.routes').then(m => m.adminRoutes)
    },
    {
        path: '',
        redirectTo: 'auth/login',
        pathMatch: 'full'
    },
    {
        path: 'public',
        loadChildren: () => 
            import('./public/public.routes').then(m => m.publicRoutes)
    },
    {
        path: '**',
        redirectTo: 'auth/login'
    }
];