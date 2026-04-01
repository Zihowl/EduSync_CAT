import { Injectable, inject } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable, catchError, switchMap, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor 
{
    private router = inject(Router);
    private authService = inject(AuthService);

    intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
        const body = (request as any).body;
        const opName = body?.operationName as string | undefined;

        const isAuthMutation = opName === 'Login' || opName === 'RefreshToken' || opName === 'ChangeCredentials';
        if (isAuthMutation) {
            return next.handle(request);
        }

        const token = this.authService.getAccessToken();
        const authenticatedRequest = token ? request.clone({ headers: request.headers.set('Authorization', `Bearer ${token}`) }) : request;

        return next.handle(authenticatedRequest).pipe(
            catchError((err: HttpErrorResponse) => {
                if (err.status === 401) {
                    return this.authService.refreshAccessToken().pipe(
                        switchMap((newToken) => {
                            const retryRequest = request.clone({ headers: request.headers.set('Authorization', `Bearer ${newToken}`) });
                            return next.handle(retryRequest);
                        }),
                        catchError((refreshErr) => {
                            this.cleanupAndRedirect();
                            return throwError(() => refreshErr);
                        })
                    );
                }

                return throwError(() => err);
            })
        );
    }

    private cleanupAndRedirect() {
        this.authService.logout();
        const msg = 'Tu sesión expiró. Inicia sesión de nuevo.';
        const currentUrl = window.location.pathname;
        sessionStorage.setItem('returnUrl', currentUrl);
        this.router.navigateByUrl('/auth/login', {
            state: {
                message: msg,
                showOnce: true,
                returnUrl: currentUrl,
            },
        });
    }
}
