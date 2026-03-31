import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonCard, IonCardContent, IonButton } from '@ionic/angular/standalone';
import { ActivatedRoute } from '@angular/router';
import { ToastController } from '@ionic/angular';

import { AuthService } from '../../../core/services/auth.service';

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
        IonButton
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
    private toastCtrl = inject(ToastController);
    private cdr = inject(ChangeDetectorRef);

    loginForm: FormGroup = this.fb.group({
        email: ['', [Validators.required, Validators.email, Validators.pattern(STRICT_EMAIL_WITH_TLD_REGEX)]],
        password: ['', [Validators.required]]
    });

    errorMessage: string = '';
    isLoading: boolean = false;
    isLockoutActive: boolean = false;
    lockoutRemainingSeconds: number = 0;
    private lockoutIntervalId: any = null;
    returnUrl: string = '/admin';
    currentYear = new Date().getFullYear();

    private startLockoutCountdown(seconds: number) {
        this.clearLockoutCountdown();
        this.lockoutRemainingSeconds = seconds;
        this.isLockoutActive = true;
        this.cdr.markForCheck();

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
        if (shouldShow)
        {
            this.errorMessage = msg;
            this.showToast(msg, 'Acceso requerido');
            window.history.replaceState({}, '', this.router.url);
        }
        else
        {
            this.errorMessage = '';
        }
        this.returnUrl =
            state?.returnUrl ||
            sessionStorage.getItem('returnUrl') ||
            '/admin';

        sessionStorage.removeItem('returnUrl');
    }

    private async showToast(message: string, header: string = 'Acceso requerido')
    {
        const toast = await this.toastCtrl.create({
            header,
            message,
            duration: 4500,
            position: 'top',
            cssClass: 'login-toast',
            icon: 'information-circle',
            animated: true,
            keyboardClose: true
        });
        await toast.present();
    }

    private parseLoginError(err: any): { message: string; title: string; lockoutSeconds?: number } {
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
                    message: `Cuenta bloqueada temporalmente. Intenta de nuevo en ${lockoutSeconds} segundos.`,
                    title: 'Cuenta bloqueada',
                    lockoutSeconds,
                };
            }

            if (code === 'UNAUTHENTICATED' || code === 'UNAUTHORIZED' || message.toLowerCase().includes('credenciales')) {
                return {
                    message: 'Verifica tu correo y contraseña.',
                    title: 'Credenciales inválidas'
                };
            }

            return {
                message: message || 'Error en el inicio de sesión. Intenta de nuevo.',
                title: 'Error de autenticación'
            };
        }

        if (networkErr) {
            return {
                message: 'No se pudo conectar al backend. Comprueba tu red o el servidor e intenta de nuevo.',
                title: 'Error de conexión'
            };
        }

        return {
            message: 'Revisa tus datos e intenta nuevamente.',
            title: 'Error de inicio de sesión'
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
                this.errorMessage = parsed.message;

                if (parsed.lockoutSeconds && parsed.lockoutSeconds > 0) {
                    this.startLockoutCountdown(parsed.lockoutSeconds);
                }

                this.showToast(this.errorMessage, parsed.title);
                this.cdr.markForCheck();
            }
        });
    }
}