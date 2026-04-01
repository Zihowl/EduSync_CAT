import { Component, inject, ChangeDetectorRef, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, Validators, NonNullableFormBuilder } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonIcon } from '@ionic/angular/standalone';
import { Subject, takeUntil } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { NotificationCardComponent, DEFAULT_NOTIFICATION_CARD_AUTO_DISMISS_MS } from '../../../shared/components/notification-card/notification-card.component';
import { AuthCardComponent } from '../../components/auth-card/auth-card.component';

const STRICT_EMAIL_WITH_TLD_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type LoginForm = {
  email: string;
  password: string;
};

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
    IonButton,
    NotificationCardComponent,
    AuthCardComponent,
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  private fb = inject(NonNullableFormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email, Validators.pattern(STRICT_EMAIL_WITH_TLD_REGEX)]],
    password: ['', [Validators.required]],
  });

  private errorTitleSignal = signal('');
  private errorMessageSignal = signal('');
  private errorIconSignal = signal('alert-circle');
  private errorStyleSignal = signal<'danger' | 'warning' | 'info'>('danger');
  private isLoadingSignal = signal(false);
  private isLockoutActiveSignal = signal(false);
  private lockoutRemainingSecondsSignal = signal(0);

  readonly errorCardAutoDismissMs = DEFAULT_NOTIFICATION_CARD_AUTO_DISMISS_MS;
  private returnUrlSignal = signal('/admin');
  currentYear = new Date().getFullYear();

  get errorTitle(): string { return this.errorTitleSignal(); }
  get errorMessage(): string { return this.errorMessageSignal(); }
  get errorIcon(): string { return this.errorIconSignal(); }
  get errorStyle(): 'danger' | 'warning' | 'info' { return this.errorStyleSignal(); }
  get isLoading(): boolean { return this.isLoadingSignal(); }
  get isLockoutActive(): boolean { return this.isLockoutActiveSignal(); }
  get lockoutRemainingSeconds(): number { return this.lockoutRemainingSecondsSignal(); }
  get returnUrl(): string { return this.returnUrlSignal(); }


  private lockoutIntervalId: number | null = null;

  private startLockoutCountdown(seconds: number): void {
    this.clearLockoutCountdown();
    this.lockoutRemainingSecondsSignal.set(seconds);
    this.isLockoutActiveSignal.set(true);

    this.setError('Cuenta bloqueada', `Cuenta bloqueada temporalmente. Intenta de nuevo en ${seconds} segundos.`, 'lock-closed');

    this.lockoutIntervalId = window.setInterval(() => {
      const next = Math.max(this.lockoutRemainingSeconds, 0) - 1;
      this.lockoutRemainingSecondsSignal.set(next);
      this.cdr.markForCheck();

      if (next <= 0) {
        this.resetLockoutState();
      }
    }, 1000);
  }

  private clearLockoutCountdown() {
    if (this.lockoutIntervalId !== null) {
      clearInterval(this.lockoutIntervalId);
      this.lockoutIntervalId = null;
    }
  }

  private resetLockoutState() {
    this.clearLockoutCountdown();
    this.isLockoutActiveSignal.set(false);
    this.lockoutRemainingSecondsSignal.set(0);
    this.resetError();
  }

  ngOnInit(): void {
    const state = (this.router.getCurrentNavigation()?.extras?.state as
      | { message?: string; returnUrl?: string; showOnce?: boolean }
      | undefined) ?? undefined;

    const msg = state?.message ?? '';
    const shouldShow = !!msg && state?.showOnce === true;

    if (shouldShow) {
      this.setError('Acceso requerido', msg, 'information-circle', 'info');
      window.history.replaceState({}, '', this.router.url);
    } else {
      this.resetError();
    }

    const fromReturnUrl = state?.returnUrl || sessionStorage.getItem('returnUrl') || '/admin';
    this.returnUrlSignal.set(fromReturnUrl);
    sessionStorage.removeItem('returnUrl');
  }

  private setError(title: string, message: string, icon: string = 'alert-circle', style: 'danger' | 'warning' | 'info' = 'danger'): void {
    this.errorTitleSignal.set(title);
    this.errorMessageSignal.set(message);
    this.errorIconSignal.set(icon);
    this.errorStyleSignal.set(style);
    this.cdr.markForCheck();
  }

  resetError(): void {
    this.errorTitleSignal.set('');
    this.errorMessageSignal.set('');
    this.errorIconSignal.set('alert-circle');
    this.cdr.markForCheck();
  }


  onSubmit(): void {
    if (this.loginForm.invalid || this.isLockoutActive) {
      return;
    }

    this.isLoadingSignal.set(true);
    this.resetError();

    const { email, password } = this.loginForm.value as { email: string; password: string };

    this.authService
      .login(email, password)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isLoadingSignal.set(false);
          this.resetLockoutState();
          sessionStorage.removeItem('returnUrl');
          this.router.navigateByUrl(this.returnUrl);
        },
        error: (err: unknown) => {
          this.isLoadingSignal.set(false);
          const parsed = this.authService.parseAuthError(err);

          if (parsed.message.toLowerCase().includes('temporal')) {
            this.setError('Contraseña temporal', 'Tu contraseña actual es temporal; por favor actualiza tus credenciales.', 'shield-half', 'info');
            this.router.navigateByUrl('/auth/change-credentials', { state: { email: this.loginForm.value.email } });
            return;
          }

          if (parsed.lockoutSeconds && parsed.lockoutSeconds > 0) {
            this.startLockoutCountdown(parsed.lockoutSeconds);
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
