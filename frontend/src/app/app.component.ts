import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
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
  private readonly notificationService = inject(NotificationService);

  readonly notification = this.notificationService.notification;

  dismissNotification(): void {
    this.notificationService.clear();
  }

  handleNotificationAction(action: NotificationCardAction): void {
    action.onClick?.();
  }
}