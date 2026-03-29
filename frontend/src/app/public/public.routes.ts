import { Routes } from '@angular/router';

export const publicRoutes: Routes = [
    {
        path: '',
        loadComponent: () =>
            import('./pages/schedule-kiosk/schedule-kiosk.component').then(m => m.ScheduleKioskComponent)
    },
    {
        path: 'schedules',
        loadComponent: () =>
            import('./pages/schedule-kiosk/schedule-kiosk.component').then(m => m.ScheduleKioskComponent)
    }
];
