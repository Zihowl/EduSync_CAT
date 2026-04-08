import { Injectable, computed, signal } from '@angular/core';

import {
  DEFAULT_NOTIFICATION_CARD_AUTO_DISMISS_MS,
  NotificationCardAction,
  NotificationCardState,
  NotificationCardStyle,
} from '../components/notification-card/notification-card.types';

interface ShowNotificationOptions {
  title?: string;
  message: string;
  icon?: string;
  styleType?: NotificationCardStyle;
  autoDismissMs?: number;
  countdown?: number;
  showClose?: boolean;
  actions?: NotificationCardAction[];
}

interface ConfirmNotificationOptions {
  title?: string;
  message: string;
  icon?: string;
  styleType?: NotificationCardStyle;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
  cancelColor?: string;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly notificationSignal = signal<NotificationCardState | null>(null);
  private pendingConfirmResolver: ((result: boolean) => void) | null = null;

  readonly notification = computed(() => this.notificationSignal());

  show(options: ShowNotificationOptions): void {
    this.resolvePendingConfirm(false);
    this.notificationSignal.set(this.buildState(options));
  }

  success(message: string, title = 'Éxito', options: Omit<ShowNotificationOptions, 'message' | 'title' | 'styleType'> = {}): void {
    this.show({
      ...options,
      title,
      message,
      styleType: 'success',
      icon: options.icon ?? 'checkmark-circle',
    });
  }

  info(message: string, title = 'Información', options: Omit<ShowNotificationOptions, 'message' | 'title' | 'styleType'> = {}): void {
    this.show({
      ...options,
      title,
      message,
      styleType: 'info',
      icon: options.icon ?? 'information-circle',
    });
  }

  warning(message: string, title = 'Atención', options: Omit<ShowNotificationOptions, 'message' | 'title' | 'styleType'> = {}): void {
    this.show({
      ...options,
      title,
      message,
      styleType: 'warning',
      icon: options.icon ?? 'alert-circle',
    });
  }

  danger(message: string, title = 'Error', options: Omit<ShowNotificationOptions, 'message' | 'title' | 'styleType'> = {}): void {
    this.show({
      ...options,
      title,
      message,
      styleType: 'danger',
      icon: options.icon ?? 'alert-circle',
    });
  }

  confirm(options: ConfirmNotificationOptions): Promise<boolean> {
    this.resolvePendingConfirm(false);

    return new Promise<boolean>((resolve) => {
      this.pendingConfirmResolver = resolve;

      this.notificationSignal.set({
        title: options.title ?? 'Confirmación',
        message: options.message,
        icon: options.icon ?? 'alert-circle',
        styleType: options.styleType ?? 'warning',
        autoDismissMs: 0,
        showClose: false,
        actions: [
          {
            label: options.cancelText ?? 'Cancelar',
            color: options.cancelColor ?? 'medium',
            fill: 'outline',
            onClick: () => {
              this.resolvePendingConfirm(false);
              this.clearState();
            },
          },
          {
            label: options.confirmText ?? 'Confirmar',
            color: options.confirmColor ?? 'danger',
            fill: 'solid',
            onClick: () => {
              this.resolvePendingConfirm(true);
              this.clearState();
            },
          },
        ],
      });
    });
  }

  clear(): void {
    this.resolvePendingConfirm(false);
    this.clearState();
  }

  private buildState(options: ShowNotificationOptions): NotificationCardState {
    return {
      title: options.title ?? 'Mensaje',
      message: options.message,
      icon: options.icon ?? 'information-circle',
      styleType: options.styleType ?? 'info',
      autoDismissMs: options.autoDismissMs ?? DEFAULT_NOTIFICATION_CARD_AUTO_DISMISS_MS,
      countdown: options.countdown,
      showClose: options.showClose ?? true,
      actions: options.actions ?? [],
    };
  }

  private clearState(): void {
    this.notificationSignal.set(null);
  }

  private resolvePendingConfirm(result: boolean): void {
    if (!this.pendingConfirmResolver) {
      return;
    }

    const resolver = this.pendingConfirmResolver;
    this.pendingConfirmResolver = null;
    resolver(result);
  }
}