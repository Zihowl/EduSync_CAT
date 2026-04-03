import { Injectable, inject } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate 
{
    private auth = inject(AuthService);
    private router = inject(Router);

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> 
    {
        return this.auth.verifySession().pipe(
            map((user) => {
                if (user) {
                    return true;
                }

                this.redirectToLogin(state.url);
                return false;
            }),
            catchError(() => {
                this.redirectToLogin(state.url);
                return of(false);
            })
        );
    }

    private redirectToLogin(returnUrl: string): void 
    {
        const msg = 'Inicia sesión para ver esta página';
        sessionStorage.setItem('returnUrl', returnUrl);
        this.router.navigateByUrl('/auth/login',
        { 
            state: 
            { 
                message: msg,
                showOnce: true,
                returnUrl 
            }
        });
    }
}