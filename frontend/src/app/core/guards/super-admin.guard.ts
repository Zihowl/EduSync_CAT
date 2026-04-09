import { Injectable, inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { catchError, map, Observable, of } from 'rxjs';

import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class SuperAdminGuard implements CanActivate {
    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);

    canActivate(_route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): Observable<boolean | UrlTree> {
        return this.auth.verifySession().pipe(
            map((user) => {
                if (!user) {
                    return this.router.createUrlTree(['/auth/login']);
                }

                return user.role === 'SUPER_ADMIN'
                    ? true
                    : this.router.createUrlTree(['/admin']);
            }),
            catchError(() => of(this.router.createUrlTree(['/auth/login'])))
        );
    }
}