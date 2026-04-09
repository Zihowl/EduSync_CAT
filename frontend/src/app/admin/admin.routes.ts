import { Routes } from '@angular/router';

import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { AuthGuard } from '../core/guards/auth.guard';
import { SuperAdminGuard } from '../core/guards/super-admin.guard';

export const adminRoutes: Routes = [
{
    path: '',
    canActivate: [AuthGuard],
    children: [
    {
        path: '', 
        component: DashboardComponent 
    },
    {   
        path: 'config', 
        canActivate: [SuperAdminGuard],
        loadComponent: () => 
            import('./pages/config/config.component').then(m => m.ConfigComponent)
    },
    {
        path: 'audit-logs',
        canActivate: [SuperAdminGuard],
        loadComponent: () =>
            import('./pages/audit-logs/audit-logs.component').then(m => m.AuditLogsComponent)
    },
    {
        path: 'upload', 
        loadComponent: () => 
            import('./pages/upload/upload.component').then(m => m.UploadComponent) 
    },
    {
        path: 'schedules',
        loadComponent: () =>
            import('./pages/schedules/schedules.component').then(m => m.SchedulesComponent)
    },
    {
        path: 'users',
        canActivate: [SuperAdminGuard],
        loadComponent: () => 
            import('./pages/users/users.component').then(m => m.UsersComponent)
    },
    {
        path: 'catalogs/teachers',
        loadComponent: () => 
            import('./pages/catalogs/teachers/teachers.component').then(m => m.TeachersComponent)
    },
    {
        path: 'catalogs/subjects',
        loadComponent: () => 
            import('./pages/catalogs/subjects/subjects.component').then(m => m.SubjectsComponent)
    },
    {
        path: 'catalogs/groups',
        loadComponent: () => 
            import('./pages/catalogs/groups/groups.component').then(m => m.GroupsComponent)
    },
    {
        path: 'catalogs/classrooms',
        loadComponent: () => 
            import('./pages/catalogs/classrooms/classrooms.component').then(m => m.ClassroomsComponent)
    },
    {
        path: 'catalogs/buildings',
        loadComponent: () => 
            import('./pages/catalogs/buildings/buildings.component').then(m => m.BuildingsComponent)
    }
    ]
  }
];
