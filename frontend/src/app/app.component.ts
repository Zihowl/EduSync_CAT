import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

import { NotificationCardComponent } from './shared/components/notification-card/notification-card.component';
import { NotificationCardAction } from './shared/components/notification-card/notification-card.types';
import { NotificationService } from './shared/services/notification.service';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [CommonModule, IonApp, IonRouterOutlet, NotificationCardComponent],
    template: `
    <app-notification-card
      *ngIf="notification() as currentNotification"
      [title]="currentNotification.title"
      [message]="currentNotification.message"
      [icon]="currentNotification.icon"
      [styleType]="currentNotification.styleType"
      [autoDismissMs]="currentNotification.autoDismissMs"
      [countdown]="currentNotification.countdown"
      [showClose]="currentNotification.showClose"
      [actions]="currentNotification.actions"
      (closed)="dismissNotification()"
      (actionSelected)="handleNotificationAction($event)">
    </app-notification-card>

    <ion-app>
      <ion-router-outlet [animated]="false"></ion-router-outlet>
    </ion-app>
  `,
})
export class AppComponent {
    private readonly router = inject(Router);
    private readonly destroyRef = inject(DestroyRef);
    private readonly notificationService = inject(NotificationService);

    readonly notification = this.notificationService.notification;

    constructor() {
        this.router.events
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((event) => {
                if (event instanceof NavigationStart) {
                    this.dismissTransientOverlays();
                }
            });
    }

    dismissNotification(): void {
        this.notificationService.clear();
    }

    handleNotificationAction(action: NotificationCardAction): void {
        action.onClick?.();
    }

    private dismissTransientOverlays(): void {
        if (typeof document === 'undefined') {
            return;
        }

        const overlays = document.querySelectorAll('ion-popover, ion-loading');

        overlays.forEach((overlay) => {
            const dismissable = overlay as HTMLElement & { dismiss?: () => Promise<void> };

            if (typeof dismissable.dismiss === 'function') {
                void dismissable.dismiss();
            }
        });
    }
}