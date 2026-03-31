import { Component, inject } from '@angular/core';
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

    loginForm: FormGroup = this.fb.group({
        email: ['', [Validators.required, Validators.email, Validators.pattern(STRICT_EMAIL_WITH_TLD_REGEX)]],
        password: ['', [Validators.required]]
    });

    errorMessage: string = '';
    isLoading: boolean = false;
    returnUrl: string = '/admin';

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

    private parseLoginError(err: any): { message: string; title: string } {
        const gqlErr = err?.graphQLErrors?.[0];
        const networkErr = err?.networkError;

        if (gqlErr) {
            const code = gqlErr?.extensions?.code?.toString?.().toUpperCase() || '';
            const message = gqlErr?.message?.toString?.() || '';

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

    OnSubmit()
    {
        if (this.loginForm.invalid)
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
                    sessionStorage.removeItem('returnUrl');
                    this.router.navigateByUrl(returnUrl);
                }
            },
            error: (err) =>
            {
                this.isLoading = false;
                const parsed = this.parseLoginError(err);
                this.errorMessage = parsed.message;
                this.showToast(this.errorMessage, parsed.title);
                console.error('Login error:', err);
            }
        });
    }
}