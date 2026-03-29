import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonCard, IonCardContent, IonButton, IonInput, IonItem, IonLabel } from '@ionic/angular/standalone';
import { ActivatedRoute } from '@angular/router';
import { ToastController } from '@ionic/angular';

import { AuthService } from '../../../core/services/auth.service';

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
        IonInput,
        IonItem,
        IonLabel
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
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]]
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
                const gqlMsg = err?.graphQLErrors?.[0]?.message;
                const netMsg = err?.networkError?.message;

                if (gqlMsg)
                {
                    this.errorMessage = gqlMsg;
                }
                else if (netMsg)
                {
                    this.errorMessage = 'No se pudo conectar al backend (posible CORS/red).';
                }
                else
                {
                    this.errorMessage = 'Credenciales inválidas o error de conexión.';
                }
                this.showToast(this.errorMessage, 'Revisa tus datos');
                console.error(err);
            }
        });
    }
}