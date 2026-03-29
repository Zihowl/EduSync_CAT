import { Routes } from '@angular/router';

import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { AuthGuard } from '../core/guards/auth.guard';

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
        loadComponent: () => 
            import('./pages/config/config.component').then(m => m.ConfigComponent)
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
