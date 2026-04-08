import { Component, Input, Output, EventEmitter, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonCard, IonCardContent, IonIcon, IonButton } from '@ionic/angular/standalone';

import { DEFAULT_NOTIFICATION_CARD_AUTO_DISMISS_MS, NotificationCardAction, NotificationCardStyle } from './notification-card.types';

export { DEFAULT_NOTIFICATION_CARD_AUTO_DISMISS_MS } from './notification-card.types';

@Component({
  selector: 'app-notification-card',
  standalone: true,
  imports: [CommonModule, IonCard, IonCardContent, IonIcon, IonButton],
  templateUrl: './notification-card.component.html',
  styleUrls: ['./notification-card.component.scss']
})
export class NotificationCardComponent {
  @Input() title = 'Error';
  @Input() message = '';
  @Input() icon: string = 'alert-circle';
  @Input() styleType: NotificationCardStyle = 'danger';
  @Input() autoDismissMs: number = DEFAULT_NOTIFICATION_CARD_AUTO_DISMISS_MS;
  @Input() countdown?: number;
  @Input() showClose = true;
  @Input() actions: NotificationCardAction[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() actionSelected = new EventEmitter<NotificationCardAction>();

  private autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    this.setupAutoDismiss();
  }

  ngOnChanges(changes: SimpleChanges) {
    // Auto-dismiss timer should reset when the visible content changes.
    if (
      changes['title'] ||
      changes['message'] ||
      changes['icon'] ||
      changes['styleType'] ||
      changes['autoDismissMs'] ||
      changes['countdown'] ||
      changes['showClose'] ||
      changes['actions']
    ) {
      this.setupAutoDismiss();
    }
  }

  ngOnDestroy() {
    this.clearAutoDismiss();
  }

  private setupAutoDismiss(): void {
    this.clearAutoDismiss();
    if (this.autoDismissMs && this.autoDismissMs > 0) {
      this.autoDismissTimer = setTimeout(() => {
        this.close();
      }, this.autoDismissMs);
    }
  }

  private clearAutoDismiss(): void {
    if (this.autoDismissTimer) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }
  }

  close(): void {
    this.clearAutoDismiss();
    this.closed.emit();
  }

  triggerAction(action: NotificationCardAction): void {
    this.clearAutoDismiss();
    this.actionSelected.emit(action);
  }
}
