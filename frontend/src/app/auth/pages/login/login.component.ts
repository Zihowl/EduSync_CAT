import { Component, inject, signal, OnDestroy, ViewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, Validators, NonNullableFormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { Subject, takeUntil } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
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
        IonButton,
        PageHeaderComponent,
        AuthCardComponent,
    ],
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit, OnDestroy {
  @ViewChild('authCard', { static: true })
      authCard!: AuthCardComponent;

  private fb = inject(NonNullableFormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private notifications = inject(NotificationService);
  private destroy$ = new Subject<void>();

  loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email, Validators.pattern(STRICT_EMAIL_WITH_TLD_REGEX)]],
      password: ['', [Validators.required]],
  });

  private isLoadingSignal = signal(false);

  private returnUrlSignal = signal('/admin');
  currentYear = new Date().getFullYear();
  get isLoading(): boolean {
      return this.isLoadingSignal(); 
  }
  get returnUrl(): string {
      return this.returnUrlSignal(); 
  }

  get emailControl() {
      return this.loginForm.get('email');
  }

  get passwordControl() {
      return this.loginForm.get('password');
  }

  getEmailFieldMessage(): string {
      return this.authCard.getFieldValidationMessage(this.emailControl, 'email');
  }

  getPasswordFieldMessage(): string {
      return this.authCard.getFieldValidationMessage(this.passwordControl, 'password');
  }

  ngOnInit(): void {
      this.notifications.clear();

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
      this.notifications.show({
          title,
          message,
          icon,
          styleType: style,
      });
  }

  resetError(): void {
      this.notifications.clear();
  }


  onSubmit(): void {
      if (this.loginForm.invalid || this.authCard?.isLockoutActive) {
          return;
      }

      this.isLoadingSignal.set(true);
      this.resetError();

      const { email, password } = this.loginForm.value as { email: string; password: string };

      this.authService
          .login(email, password)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
              next: (user) => {
                  this.isLoadingSignal.set(false);
                  this.authCard.clearLockoutCountdown();

                  if (user.isTempPassword) {
                      sessionStorage.setItem('returnUrl', this.returnUrl);
                      this.router.navigateByUrl('/auth/change-credentials', {
                          state: {
                              email,
                              message: 'Tu contraseña actual es temporal; por favor actualiza tus credenciales.',
                              changeEmailAllowed: user.role === 'SUPER_ADMIN',
                              returnUrl: this.returnUrl,
                          },
                      });
                      return;
                  }

                  sessionStorage.removeItem('returnUrl');
                  this.router.navigateByUrl(this.returnUrl);
              },
              error: (err: unknown) => {
                  this.isLoadingSignal.set(false);
                  const parsed = this.authService.parseAuthError(err);

                  if (parsed.lockoutSeconds && parsed.lockoutSeconds > 0) {
                      this.authCard.startLockoutCountdown(parsed.lockoutSeconds);
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
