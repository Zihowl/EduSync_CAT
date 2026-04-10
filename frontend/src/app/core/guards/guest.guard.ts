import { Injectable, inject } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, catchError, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GuestGuard implements CanActivate {
    private auth = inject(AuthService);
    private router = inject(Router);

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
        return this.auth.verifySession().pipe(
            map((user) => {
                if (!user) {
                    return true;
                }

                this.router.navigateByUrl('/admin');
                return false;
            }),
            catchError(() => of(true))
        );
    }
}
