import { Component, inject, ChangeDetectorRef, signal, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, Validators, NonNullableFormBuilder, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonIcon } from '@ionic/angular/standalone';
import { Subject, takeUntil } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { NotificationCardComponent, DEFAULT_NOTIFICATION_CARD_AUTO_DISMISS_MS } from '../../../shared/components/notification-card/notification-card.component';
import { AuthCardComponent } from '../../components/auth-card/auth-card.component';

const STRICT_EMAIL_WITH_TLD_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type ChangePasswordForm = {
  current_email: string;
  current_password: string;
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
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButton,
    NotificationCardComponent,
    AuthCardComponent,
  ],
  templateUrl: './change-password.component.html',
  styleUrls: ['./change-password.component.scss'],
})
export class ChangePasswordComponent {
  @ViewChild('authCard', { static: true })
  authCard!: AuthCardComponent;

  private fb = inject(NonNullableFormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  form = this.fb.group({
    current_email: ['', [Validators.required, Validators.pattern(STRICT_EMAIL_WITH_TLD_REGEX)]],
    current_password: ['', [Validators.required, Validators.minLength(8)]],
    new_email: ['', [Validators.required, Validators.pattern(STRICT_EMAIL_WITH_TLD_REGEX)]],
    new_password: ['', [Validators.required, Validators.minLength(8)]],
    confirm_password: ['', [Validators.required]],
  }, { validators: this.passwordsMatchValidator });

  private errorTitleSignal = signal('');
  private errorMessageSignal = signal('');
  private errorIconSignal = signal('alert-circle');
  private errorStyleSignal = signal<'danger' | 'warning' | 'info'>('danger');
  private isLoadingSignal = signal(false);
  readonly errorCardAutoDismissMs = DEFAULT_NOTIFICATION_CARD_AUTO_DISMISS_MS;

  get errorTitle(): string {
    return this.errorTitleSignal();
  }

  get errorMessage(): string {
    return this.errorMessageSignal();
  }

  get errorIcon(): string {
    return this.errorIconSignal();
  }

  get errorStyle(): 'danger' | 'warning' | 'info' {
    return this.errorStyleSignal();
  }

  get isLoading(): boolean {
    return this.isLoadingSignal();
  }

  private setError(title: string, message: string, icon: string = 'alert-circle', style: 'danger' | 'warning' | 'info' = 'danger'): void {
    this.errorTitleSignal.set(title);
    this.errorMessageSignal.set(message);
    this.errorIconSignal.set(icon);
    this.errorStyleSignal.set(style);
    this.cdr.markForCheck();
  }

  ngOnInit(): void {
    const email = this.router.getCurrentNavigation()?.extras?.state as { email?: string } | undefined;
    if (email?.email) {
      this.form.patchValue({ current_email: email.email, new_email: email.email });
    }
  }

  resetError(): void {
    this.errorTitleSignal.set('');
    this.errorMessageSignal.set('');
    this.errorIconSignal.set('alert-circle');
    this.cdr.markForCheck();
  }

private passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
        const group = control as FormGroup;
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

  onSubmit(): void {
    if (this.form.invalid) {
      this.setError('Formulario inválido', 'Revisa los datos e intenta de nuevo.', 'alert-circle', 'warning');
      return;
    }

    this.isLoadingSignal.set(true);
    this.resetError();

    const { current_email, current_password, new_email, new_password } = this.form.value as {
      current_email: string;
      current_password: string;
      new_email: string;
      new_password: string;
      confirm_password: string;
    };

    if (!this.meetsComplexity(new_password)) {
      this.isLoadingSignal.set(false);
      this.setError('Contraseña débil', 'La contraseña debe tener al menos 8 caracteres e incluir al menos 3 categorías: mayúsculas, minúsculas, números y símbolos.', 'shield-checkmark', 'warning');
      return;
    }

    this.authService
      .changeCredentials({ currentEmail: current_email, currentPassword: current_password, newEmail: new_email, newPassword: new_password })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isLoadingSignal.set(false);
          this.router.navigateByUrl('/auth/login');
        },
        error: (err: unknown) => {
          this.isLoadingSignal.set(false);
          const parsed = this.authService.parseAuthError(err);

          if (parsed.lockoutSeconds && parsed.lockoutSeconds > 0) {
            this.authCard.startLockoutCountdown(parsed.lockoutSeconds);
          }

          this.setError(parsed.title, parsed.message, 'alert-circle', parsed.style);
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
