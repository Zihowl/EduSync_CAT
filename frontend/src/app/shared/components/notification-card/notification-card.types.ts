export type NotificationCardStyle = 'danger' | 'warning' | 'info' | 'success';

export interface NotificationCardAction {
  label: string;
  color?: string;
  fill?: 'solid' | 'outline' | 'clear';
  ariaLabel?: string;
  onClick?: () => void;
}

export interface NotificationCardState {
  title: string;
  message: string;
  icon: string;
  styleType: NotificationCardStyle;
  autoDismissMs: number;
  countdown?: number;
  showClose: boolean;
  actions: NotificationCardAction[];
}

export const DEFAULT_NOTIFICATION_CARD_AUTO_DISMISS_MS = 6000;