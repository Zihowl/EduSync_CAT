import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { addIcons } from 'ionicons';
import { IonBackButton, IonBadge, IonButton, IonButtons, IonHeader, IonIcon, IonPopover, IonToolbar } from '@ionic/angular/standalone';
import { logOutOutline, reorderThreeOutline } from 'ionicons/icons';

export interface PageHeaderMenuItem {
  label: string;
  value: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
}

addIcons({ reorderThreeOutline, logOutOutline });

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule, IonBackButton, IonBadge, IonButton, IonButtons, IonHeader, IonIcon, IonPopover, IonToolbar],
  templateUrl: './page-header.component.html',
  styleUrls: ['./page-header.component.scss'],
})
export class PageHeaderComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() showBackButton = false;
  @Input() backDefaultHref = '/';
  @Input() backText = '';
  @Input() showStatusBadge = false;
  @Input() statusBadgeText = '';
  @Input() statusBadgeIcon = '';
  @Input() statusBadgeTone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' = 'neutral';
  @Input() showActionButton = false;
  @Input() actionButtonIcon = '';
  @Input() actionButtonText = '';
  @Input() actionButtonAriaLabel = '';
  @Input() showMenuButton = false;
  @Input() menuButtonIcon = 'reorder-three-outline';
  @Input() menuButtonAriaLabel = 'Abrir menú';
  @Input() menuItems: PageHeaderMenuItem[] = [];

  @Output() actionButtonClick = new EventEmitter<void>();
  @Output() menuItemSelected = new EventEmitter<PageHeaderMenuItem>();

  @ViewChild('menuPopover') menuPopover?: HTMLIonPopoverElement;

  isMenuOpen = false;

  selectMenuItem(item: PageHeaderMenuItem, event: Event): void {
    event.stopPropagation();
    if (item.disabled) {
      return;
    }

    void this.menuPopover?.dismiss();
    this.menuItemSelected.emit(item);
  }

  trackByMenuItem(index: number, item: PageHeaderMenuItem): string {
    return `${item.value}-${index}`;
  }
}