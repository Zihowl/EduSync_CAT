import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonIcon } from '@ionic/angular/standalone';

import { AuthService } from '../../../core/services/auth.service';
import { NotificationCardComponent, DEFAULT_NOTIFICATION_CARD_AUTO_DISMISS_MS } from '../../../shared/components/notification-card/notification-card.component';
import { AuthCardComponent } from '../../components/auth-card/auth-card.component';

const STRICT_EMAIL_WITH_TLD_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

@Component({
    selector: 'app-change-password',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        IonContent,
        IonHeader,
        IonTitle,
        IonToolbar,
        IonButton,
        NotificationCardComponent,
        AuthCardComponent
    ],
    templateUrl: './change-password.component.html',
    styleUrls: ['./change-password.component.scss']
})
export class ChangePasswordComponent {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private router = inject(Router);
    private cdr = inject(ChangeDetectorRef);

    form: FormGroup = this.fb.group({
        current_email: ['', [Validators.required, Validators.pattern(STRICT_EMAIL_WITH_TLD_REGEX)]],
        current_password: ['', [Validators.required, Validators.minLength(8)]],
        new_email: ['', [Validators.required, Validators.pattern(STRICT_EMAIL_WITH_TLD_REGEX)]],
        new_password: ['', [Validators.required, Validators.minLength(8)]],
        confirm_password: ['', [Validators.required]]
    }, { validators: this.passwordsMatchValidator });

    errorMessage = '';
    errorTitle = '';
    errorIcon = 'alert-circle';
    errorStyle: 'danger' | 'warning' | 'info' = 'danger';
    isLoading = false;
    readonly errorCardAutoDismissMs = DEFAULT_NOTIFICATION_CARD_AUTO_DISMISS_MS;

    private setError(title: string, message: string, icon: string = 'alert-circle', style: 'danger' | 'warning' | 'info' = 'danger') {
        this.errorTitle = title;
        this.errorMessage = message;
        this.errorIcon = icon;
        this.errorStyle = style;
        this.cdr.markForCheck();
    }

    ngOnInit() {
        const nav = this.router.getCurrentNavigation();
        const state = nav?.extras?.state as { email?: string } | undefined;
        const email = state?.email || '';
        if (email) {
            this.form.patchValue({ current_email: email, new_email: email });
        }
    }

    public resetError() {
        this.errorTitle = '';
        this.errorMessage = '';
        this.errorIcon = 'alert-circle';
        this.cdr.markForCheck();
    }

    private passwordsMatchValidator(group: FormGroup) {
        const newPassword = group.get('new_password')?.value;
        const confirmPassword = group.get('confirm_password')?.value;
        return newPassword === confirmPassword ? null : { passwordMismatch: true };
    }

    private meetsComplexity(password: string): boolean {
        const upper = /[A-Z]/.test(password);
        const lower = /[a-z]/.test(password);
        const number = /[0-9]/.test(password);
        const symbol = /[!@#$%^&*()\-_=+\[\]{}<>?]/.test(password);
        return [upper, lower, number, symbol].filter(Boolean).length >= 3;
    }

    onSubmit() {
        if (this.form.invalid) {
            this.setError('Formulario inválido', 'Revisa los datos e intenta de nuevo.', 'alert-circle', 'warning');
            return;
        }

        this.isLoading = true;
        this.resetError();

        const { current_email, current_password, new_email, new_password } = this.form.value;

        if (!this.meetsComplexity(new_password)) {
            this.isLoading = false;
            this.setError('Contraseña débil', 'La contraseña debe tener al menos 8 caracteres e incluir al menos 3 categorías: mayúsculas, minúsculas, números y símbolos.', 'shield-checkmark', 'warning');
            return;
        }

        this.authService.changeCredentials(current_email, current_password, new_email, new_password).subscribe({
            next: success => {
                this.isLoading = false;
                if (success) {
                    this.router.navigateByUrl('/auth/login');
                } else {
                    this.setError('Error', 'No se pudo cambiar credenciales.', 'alert-circle', 'danger');
                }
            },
            error: err => {
                this.isLoading = false;
                const message = err?.graphQLErrors?.[0]?.message || err?.message || 'Error de servidor';
                this.setError('Error al actualizar credenciales', message, 'alert-circle', 'danger');
            }
        });
    }
}
