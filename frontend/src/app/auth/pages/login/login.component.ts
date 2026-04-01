import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonCard, IonCardContent, IonButton, IonIcon } from '@ionic/angular/standalone';
import { ActivatedRoute } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { NotificationCardComponent, DEFAULT_NOTIFICATION_CARD_AUTO_DISMISS_MS } from '../../../shared/components/notification-card/notification-card.component';

const STRICT_EMAIL_WITH_TLD_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        IonContent,
        IonHeader,
        IonTitle,
        IonToolbar,
        IonCard,
        IonCardContent,
        IonButton,
        NotificationCardComponent
    ],
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss']
})
export class LoginComponent
{
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private cdr = inject(ChangeDetectorRef);

    loginForm: FormGroup = this.fb.group({
        email: ['', [Validators.required, Validators.email, Validators.pattern(STRICT_EMAIL_WITH_TLD_REGEX)]],
        password: ['', [Validators.required]]
    });

    errorMessage: string = '';
    errorTitle: string = '';
    errorIcon: string = 'alert-circle';
    errorStyle: 'danger' | 'warning' | 'info' = 'danger';
    isLoading: boolean = false;
    isLockoutActive: boolean = false;
    lockoutRemainingSeconds: number = 0;
    private lockoutIntervalId: any = null;
    readonly errorCardAutoDismissMs = DEFAULT_NOTIFICATION_CARD_AUTO_DISMISS_MS;
    returnUrl: string = '/admin';
    currentYear = new Date().getFullYear();

    private startLockoutCountdown(seconds: number) {
        this.clearLockoutCountdown();
        this.lockoutRemainingSeconds = seconds;
        this.isLockoutActive = true;

        this.setError('Cuenta bloqueada', `Cuenta bloqueada temporalmente. Intenta de nuevo en ${seconds} segundos.`, 'lock-closed');

        this.lockoutIntervalId = setInterval(() => {
            this.lockoutRemainingSeconds = Math.max(this.lockoutRemainingSeconds - 1, 0);
            this.cdr.markForCheck();
            if (this.lockoutRemainingSeconds <= 0) {
                this.resetLockoutState();
            }
        }, 1000);
    }

    private clearLockoutCountdown() {
        if (this.lockoutIntervalId) {
            clearInterval(this.lockoutIntervalId);
            this.lockoutIntervalId = null;
        }
    }

    private resetLockoutState() {
        this.clearLockoutCountdown();
        this.isLockoutActive = false;
        this.lockoutRemainingSeconds = 0;
        this.errorMessage = '';
        this.cdr.markForCheck();
    }

    ngOnInit()
    {
        const nav = this.router.currentNavigation();
        const state = nav?.extras?.state as
            { message?: string, returnUrl?: string, showOnce?: boolean } | undefined;

        const msg = state?.message || '';
        const shouldShow = !!msg && state?.showOnce === true;
        if (shouldShow) {
            this.setError('Acceso requerido', msg, 'information-circle');
            window.history.replaceState({}, '', this.router.url);
        } else {
            this.resetError();
        }
        this.returnUrl =
            state?.returnUrl ||
            sessionStorage.getItem('returnUrl') ||
            '/admin';

        sessionStorage.removeItem('returnUrl');
    }

    private setError(title: string, message: string, icon: string = 'alert-circle', styleType: 'danger' | 'warning' | 'info' = 'danger') {
        this.errorTitle = title;
        this.errorMessage = message;
        this.errorIcon = icon;
        this.errorStyle = styleType;
        this.cdr.markForCheck();
    }

    resetError() {
        this.errorTitle = '';
        this.errorMessage = '';
        this.errorIcon = 'alert-circle';
        this.cdr.markForCheck();
    }

    private parseLoginError(err: any): { message: string; title: string; style: 'danger' | 'warning' | 'info'; lockoutSeconds?: number } {
        const gqlErr = err?.graphQLErrors?.[0];
        const networkErr = err?.networkError;
        const message = gqlErr?.message?.toString?.() || err?.message?.toString?.() || '';

        if (gqlErr || message) {
            const code = gqlErr?.extensions?.code?.toString?.().toUpperCase() || '';

            // Check for lockout message
            const lockoutMatch = message.match(/(?:en\s+)?(\d+)\s+segundos?(?:[.!?]*|$)/i);
            if (lockoutMatch) {
                const lockoutSeconds = Number(lockoutMatch[1]);
                return {
                    message: 'Cuenta bloqueada temporalmente.',
                    title: 'Cuenta bloqueada',
                    style: 'danger',
                    lockoutSeconds,
                };
            }

            if (code === 'UNAUTHENTICATED' || code === 'UNAUTHORIZED' || message.toLowerCase().includes('credenciales')) {
                return {
                    message: 'Verifica tu correo y contraseña.',
                    title: 'Credenciales inválidas',
                    style: 'warning'
                };
            }

            return {
                message: message || 'Error en el inicio de sesión. Intenta de nuevo.',
                title: 'Error de autenticación',
                style: 'danger'
            };
        }

        if (networkErr) {
            return {
                message: 'No se pudo conectar al backend. Comprueba tu red o el servidor e intenta de nuevo.',
                title: 'Error de conexión',
                style: 'danger'
            };
        }

        return {
            message: 'Revisa tus datos e intenta nuevamente.',
            title: 'Error de inicio de sesión',
            style: 'warning'
        };
    }

    onSubmit()
    {
        if (this.loginForm.invalid || this.isLockoutActive)
        {
            return;
        }

        this.isLoading = true;
        this.errorMessage = '';

        const { email, password } = this.loginForm.value;

        this.authService.Login(email, password).subscribe({
            next: (success) =>
            {
                this.isLoading = false;
                const returnUrl = this.returnUrl;
                if (success)
                {
                    this.resetLockoutState();
                    sessionStorage.removeItem('returnUrl');
                    this.router.navigateByUrl(returnUrl);
                }
            },
            error: (err) =>
            {
                this.isLoading = false;
                const parsed = this.parseLoginError(err);

                if (parsed.message.toLowerCase().includes('temporal')) {
                    this.setError('Contraseña temporal', 'Tu contraseña actual es temporal; por favor actualiza tus credenciales.', 'shield-half', 'info');
                    this.router.navigateByUrl('/auth/change-credentials', { state: { email: this.loginForm.value.email } });
                    return;
                }

                if (parsed.lockoutSeconds && parsed.lockoutSeconds > 0) {
                    this.startLockoutCountdown(parsed.lockoutSeconds);
                }

                this.setError(parsed.title, parsed.message, parsed.lockoutSeconds ? 'lock-closed' : 'alert-circle', parsed.style);
            }
        });
    }
}