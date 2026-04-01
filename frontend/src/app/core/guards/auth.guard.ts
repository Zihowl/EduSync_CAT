import { Injectable, inject } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate 
{
    private auth = inject(AuthService);
    private router = inject(Router);

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean 
    {
        if (this.auth.isAuthenticated()) return true;
        const msg = 'Inicia sesión para ver esta página';
        sessionStorage.setItem('returnUrl', state.url);
        this.router.navigateByUrl('/auth/login',
        { 
            state: 
            { 
                message: msg,
                showOnce: true,
                returnUrl: state.url 
            }
        });
        return false;
    }
}