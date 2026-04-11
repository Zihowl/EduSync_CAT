export type ScheduleCalendarTone = 'primary' | 'success' | 'warning' | 'danger' | 'medium' | 'tertiary';

export const SCHEDULE_DEFAULT_VISIBLE_DAYS: number[] = [1, 2, 3, 4, 5];
export const SCHEDULE_DEFAULT_START_MINUTE = 0 * 60;
export const SCHEDULE_DEFAULT_END_MINUTE = 24 * 60;

export interface ScheduleCalendarAction {
  id: string;
  label: string;
  icon: string;
  tone?: ScheduleCalendarTone;
}

export interface ScheduleCalendarEvent {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  title: string;
  subtitle?: string;
  meta?: string[];
  statusLabel?: string;
  statusTone?: ScheduleCalendarTone;
  selected?: boolean;
  editable?: boolean;
  blocked?: boolean;
  payload?: unknown;
  actions?: ScheduleCalendarAction[];
}

export interface ScheduleCalendarLayoutEvent extends ScheduleCalendarEvent {
  top: number;
  height: number;
  left: number;
  width: number;
  lane: number;
  laneCount: number;
  isToday: boolean;
}

export interface ScheduleCalendarCellClick {
  dayOfWeek: number;
  minuteOfDay: number;
  time: string;
}

export interface ScheduleCalendarActionClick {
  event: ScheduleCalendarEvent;
  action: ScheduleCalendarAction;
}

export const SCHEDULE_DAY_NAMES: Record<number, string> = {
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado',
    7: 'Domingo',
};

export const SCHEDULE_DAY_SHORT_NAMES: Record<number, string> = {
    1: 'Lun',
    2: 'Mar',
    3: 'Mié',
    4: 'Jue',
    5: 'Vie',
    6: 'Sáb',
    7: 'Dom',
};

export function normalizeDayOfWeek(dayOfWeek: number): number {
    if (dayOfWeek === 0) {
        return 7;
    }

    return dayOfWeek;
}

export function getTodayDayOfWeek(date: Date = new Date()): number {
    return normalizeDayOfWeek(date.getDay());
}

export function parseClockTime(value: string | null | undefined): number {
    if (!value) {
        return 0;
    }

    const [rawHour = '0', rawMinute = '0'] = value.split(':');
    const hour = Number.parseInt(rawHour, 10);
    const minute = Number.parseInt(rawMinute, 10);

    if (Number.isNaN(hour) || Number.isNaN(minute)) {
        return 0;
    }

    return (hour * 60) + minute;
}

export function formatClockTime(totalMinutes: number): string {
    const normalizedMinutes = Math.max(0, Math.floor(totalMinutes));
    const hour = Math.floor(normalizedMinutes / 60);
    const minute = normalizedMinutes % 60;

    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

export function buildVisibleScheduleDays(dayOfWeekValues: Array<number | null | undefined>): number[] {
  const weekendDays = new Set(
    dayOfWeekValues
      .map((day) => (day == null ? null : normalizeDayOfWeek(Number(day))))
      .filter((day): day is number => day === 6 || day === 7)
  );
  const visibleDays = [...SCHEDULE_DEFAULT_VISIBLE_DAYS];

  if (weekendDays.has(6)) {
    visibleDays.push(6);
  }

  if (weekendDays.has(7)) {
    visibleDays.push(7);
  }

  return visibleDays;
}
