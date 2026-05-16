import { Component, inject, signal, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, Validators, NonNullableFormBuilder, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { Subject, takeUntil } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { AuthCardComponent } from '../../components/auth-card/auth-card.component';
import { PasswordToggleDirective } from '../../../shared/directives/password-toggle.directive';

const STRICT_EMAIL_WITH_TLD_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type ChangePasswordForm = {
  new_email: string;
  new_password: string;
  confirm_password: string;
};

@Component({
    selector: 'app-change-password',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        IonContent,
        IonButton,
        PageHeaderComponent,
        AuthCardComponent,
        PasswordToggleDirective,
    ],
    templateUrl: './change-password.component.html',
    styleUrls: ['./change-password.component.scss'],
})
export class ChangePasswordComponent implements OnInit, OnDestroy {
  @ViewChild('authCard', { static: true })
      authCard!: AuthCardComponent;

  canChangeEmail = false;
  accountEmail = '';

  private fb = inject(NonNullableFormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private notifications = inject(NotificationService);
  private destroy$ = new Subject<void>();

  form = this.fb.group({
      new_email: ['', [Validators.required, Validators.pattern(STRICT_EMAIL_WITH_TLD_REGEX), this.emailExtensionValidator]],
      new_password: ['', [Validators.required, Validators.minLength(8), this.complexityValidator]],
      confirm_password: ['', [Validators.required]],
  }, { validators: [this.passwordsMatchValidator] });

  private isLoadingSignal = signal(false);

  get isLoading(): boolean {
      return this.isLoadingSignal();
  }

  get newPasswordControl() {
      return this.form.get('new_password');
  }

  get newEmailControl() {
      return this.form.get('new_email');
  }

  get confirmPasswordControl() {
      return this.form.get('confirm_password');
  }

  private setError(title: string, message: string, icon: string = 'alert-circle', style: 'danger' | 'warning' | 'info' = 'danger'): void {
      this.notifications.show({
          title,
          message,
          icon,
          styleType: style,
      });
  }

  ngOnInit(): void {
      this.notifications.clear();

      const currentUser = this.authService.getCurrentUser();
      const state = this.router.getCurrentNavigation()?.extras?.state as
      | { email?: string; message?: string; changeEmailAllowed?: boolean }
      | undefined;

      this.canChangeEmail = currentUser?.role === 'SUPER_ADMIN' || !!state?.changeEmailAllowed;
      this.accountEmail = state?.email ?? currentUser?.email ?? '';

      if (this.accountEmail) {
          this.form.patchValue({ new_email: this.accountEmail });
          if (!this.canChangeEmail) {
              this.form.get('new_email')?.clearValidators();
              this.form.get('new_email')?.updateValueAndValidity();
          }
      }

      if (state?.message) {
          this.setError('Contraseña temporal', state.message, 'shield-half', 'info');
          window.history.replaceState({}, '', this.router.url);
      }
  }

  resetError(): void {
      this.notifications.clear();
  }

  private passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
      const group = control as FormGroup;
      const newPassword = group.get('new_password')?.value;
      const confirmPassword = group.get('confirm_password')?.value;
      return newPassword === confirmPassword ? null : { passwordMismatch: true };
  }

  private emailExtensionValidator(control: AbstractControl): ValidationErrors | null {
      const email = control.value as string;
      if (!email || typeof email !== 'string') {
          return null;
      }

      const atIndex = email.indexOf('@');
      if (atIndex < 0) {
          return null;
      }

      const domain = email.slice(atIndex + 1);
      const parts = domain.split('.');
      if (parts.length < 2) {
          return { invalidExtension: true };
      }

      const tld = parts[parts.length - 1];
      if (tld.length < 2) {
          return { invalidExtension: true };
      }

      if (domain.toLowerCase() === 'setup.local') {
          return { forbiddenDomain: true };
      }

      return null;
  }

  private complexityValidator(control: AbstractControl): ValidationErrors | null {
      const password = control.value as string;
      if (!password) {
          return null;
      }
      const upper = /[A-Z]/.test(password);
      const lower = /[a-z]/.test(password);
      const number = /[0-9]/.test(password);
      const symbol = /[!@#$%^&*()\-_=+\[\]{}<>?]/.test(password);
      const categories = [upper, lower, number, symbol].filter(Boolean).length;
      return categories >= 3 ? null : { weakPassword: true };
  }

  onSubmit(): void {
      this.form.markAllAsTouched();

      if (this.form.invalid) {
          if (this.form.hasError('passwordMismatch')) {
              this.setError('Contraseñas no coinciden', 'La nueva contraseña y la confirmación deben ser idénticas.', 'alert-circle', 'warning');
          } else {
              this.setError('Formulario inválido', 'Revisa los campos señalados e intenta de nuevo.', 'alert-circle', 'warning');
          }
          return;
      }

      this.isLoadingSignal.set(true);
      this.resetError();

      const { new_email, new_password } = this.form.value as {
      new_email: string;
      new_password: string;
      confirm_password: string;
    };

      const payloadNewEmail = this.canChangeEmail ? new_email : this.accountEmail;

      this.authService
          .changeCredentials({ newEmail: payloadNewEmail, newPassword: new_password })
          .pipe(takeUntil(this.destroy$))
          .subscribe({
              next: () => {
                  this.isLoadingSignal.set(false);
                  this.router.navigateByUrl('/auth/login', {
                      state: {
                          message: 'Credenciales actualizadas con éxito.',
                          showOnce: true,
                      },
                  });
              },
              error: (err: unknown) => {
                  this.isLoadingSignal.set(false);
                  const parsed = this.authService.parseAuthError(err);

                  if (parsed.lockoutSeconds && parsed.lockoutSeconds > 0) {
                      this.authCard.startLockoutCountdown(parsed.lockoutSeconds);
                  }

                  // Token expirado/ inválido: la sesión de cambio ya no sirve,
                  // hay que volver a iniciar sesión.
                  if (this.authService.isSessionError(err)) {
                      this.router.navigateByUrl('/auth/login', {
                          state: {
                              message: 'Tu sesión expiró, vuelve a iniciar sesión.',
                              showOnce: true,
                          },
                      });
                      return;
                  }

                  this.setError(parsed.title, parsed.message, parsed.lockoutSeconds ? 'lock-closed' : 'alert-circle', parsed.style);
              },
          });
  }

  ngOnDestroy(): void {
      this.destroy$.next();
      this.destroy$.complete();
  }
}
