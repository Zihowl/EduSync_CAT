import { Component, Input, Output, EventEmitter, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonCard, IonCardContent, IonIcon, IonButton } from '@ionic/angular/standalone';

export const DEFAULT_NOTIFICATION_CARD_AUTO_DISMISS_MS = 6000;

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
  @Input() styleType: 'danger' | 'warning' | 'info' = 'danger';
  @Input() autoDismissMs: number = DEFAULT_NOTIFICATION_CARD_AUTO_DISMISS_MS;
  @Input() countdown?: number;
  @Input() showClose = true;
  @Output() closed = new EventEmitter<void>();

  private autoDismissTimer: any;

  ngOnInit() {
    this.setupAutoDismiss();
  }

  ngOnChanges(changes: SimpleChanges) {
    // Auto-dismiss timer should reset sólo cuando cambia el contenido principal
    if (
      changes['title'] ||
      changes['message'] ||
      changes['icon'] ||
      changes['autoDismissMs']
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
}
