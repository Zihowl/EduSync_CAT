import { Injectable, inject } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';

@Injectable()
export class AuthInterceptor implements HttpInterceptor 
{
    private router = inject(Router);

    intercept
    (
        request: HttpRequest<unknown>,
        next: HttpHandler
    ):
        Observable<HttpEvent<unknown>> 
        {
            const body = (request as any).body;
            const opName = body?.operationName;
            const query = typeof body?.query === 'string' ? body.query : '';
            const isLogin = opName === 'Login'

            if (!isLogin)
            {
                const token = localStorage.getItem('auth_token');
                if (token)
                {
                    const cloned = request.clone(
                    {
                        headers: request.headers.set('Authorization', `Bearer ${token}`)
                    });
                    return next.handle(cloned).pipe(
                        catchError((err: HttpErrorResponse) =>
                        {
                            if (err.status === 401)
                            {
                                localStorage.removeItem('auth_token');
                                localStorage.removeItem('user_data');
                                const msg = 'Tu sesión expiró. Inicia sesión de nuevo.';
                                const currentUrl = window.location.pathname;
                                sessionStorage.setItem('returnUrl', currentUrl);
                                this.router.navigateByUrl('/auth/login', 
                                { 
                                    state: 
                                    { 
                                        message: msg, 
                                        showOnce: true 
                                    }
                                });
                            }
                            return throwError(() => err);
                        })
                    );
                }
            }

            return next.handle(request);
        }
}