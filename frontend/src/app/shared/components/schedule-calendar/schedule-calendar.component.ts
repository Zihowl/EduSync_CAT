import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { addIcons } from 'ionicons';
import { calendarOutline, checkmarkCircleOutline, ellipseOutline } from 'ionicons/icons';
import { IonBadge, IonChip, IonIcon } from '@ionic/angular/standalone';
import {
    formatClockTime,
    getTodayDayOfWeek,
    normalizeDayOfWeek,
    parseClockTime,
    SCHEDULE_DEFAULT_END_MINUTE,
    SCHEDULE_DEFAULT_START_MINUTE,
    SCHEDULE_DEFAULT_VISIBLE_DAYS,
    SCHEDULE_DAY_NAMES,
    SCHEDULE_DAY_SHORT_NAMES,
    ScheduleCalendarAction,
    ScheduleCalendarActionClick,
    ScheduleCalendarCellClick,
    ScheduleCalendarEvent,
    ScheduleCalendarLayoutEvent,
} from './schedule-calendar.model';

interface DayCluster {
  events: ScheduleCalendarEvent[];
  maxEnd: number;
}

@Component({
    selector: 'app-schedule-calendar',
    standalone: true,
    imports: [CommonModule, IonBadge, IonChip, IonIcon],
    template: `
    <div class="schedule-calendar" [style.--schedule-day-count]="visibleDays.length">
      <div class="schedule-calendar__viewport">
        <div *ngIf="showHeaders && !showEmptyState" class="schedule-calendar__header">
          <div class="schedule-calendar__time-head">
            <span>Hora</span>
          </div>

          <button
            *ngFor="let day of visibleDays; trackBy: trackByDay"
            type="button"
            class="schedule-calendar__day-head"
            [class.schedule-calendar__day-head--today]="day === todayDayOfWeek"
            [class.schedule-calendar__day-head--active]="day === highlightedDay"
            (click)="emitDayHeaderClick(day)">
            <span class="schedule-calendar__day-short">{{ getDayShortLabel(day) }}</span>
            <strong class="schedule-calendar__day-name">{{ getDayLabel(day) }}</strong>
            <span class="schedule-calendar__day-count">{{ getEventsForDay(day).length }} bloques</span>
          </button>
        </div>

        <div *ngIf="showEmptyState; else calendarBody" class="schedule-calendar__body schedule-calendar__body--empty" [style.--schedule-calendar-height.px]="calendarHeight">
          <div class="schedule-calendar__empty-state" role="status" aria-live="polite">
            <ion-icon [name]="emptyIcon" class="schedule-calendar__empty-state-icon"></ion-icon>
            <h3>{{ emptyTitle }}</h3>
            <p>{{ emptySubtitle }}</p>
          </div>
        </div>

        <ng-template #calendarBody>
          <div class="schedule-calendar__body" [style.--schedule-calendar-height.px]="calendarHeight">
            <div class="schedule-calendar__time-rail">
              <span
                *ngFor="let hour of hourMarkers; trackBy: trackByHour"
                class="schedule-calendar__hour-label"
                [class.schedule-calendar__hour-label--start]="hour === firstHourMarker"
                [class.schedule-calendar__hour-label--end]="hour === lastHourMarker"
                [style.top.px]="(hour * 60 - startMinute) * minuteHeight">
                {{ formatHour(hour) }}
              </span>
            </div>

            <div class="schedule-calendar__days">
              <section
                *ngFor="let day of visibleDays; trackBy: trackByDay"
                class="schedule-calendar__day-column"
                [class.schedule-calendar__day-column--today]="day === todayDayOfWeek"
                [class.schedule-calendar__day-column--active]="day === highlightedDay">

                <div class="schedule-calendar__grid-lines"></div>

                <button
                  *ngFor="let cell of slots; trackBy: trackByCell"
                  type="button"
                  class="schedule-calendar__cell"
                  [style.top.px]="cell.top"
                  [style.height.px]="cell.height"
                  (click)="emitCellClick(day, cell.minuteOfDay)">
                </button>

                <div
                  *ngIf="day === todayDayOfWeek && showCurrentTimeMarker && currentTimeTop >= 0 && currentTimeTop <= calendarHeight"
                  class="schedule-calendar__current-time"
                  [style.top.px]="currentTimeTop">
                  <span class="schedule-calendar__current-time-dot"></span>
                  <span class="schedule-calendar__current-time-line"></span>
                </div>

                <article
                  *ngFor="let event of getLayoutsForDay(day); trackBy: trackByLayoutEvent"
                  class="schedule-calendar__event"
                  [class.schedule-calendar__event--selected]="event.selected"
                  [class.schedule-calendar__event--blocked]="event.blocked"
                  [class.schedule-calendar__event--today]="event.isToday"
                  [style.top.px]="event.top"
                  [style.height.px]="event.height"
                  [style.left.%]="event.left"
                  [style.width.%]="event.width"
                  [style.zIndex]="event.selected ? 3 : 2"
                  [attr.data-tone]="event.statusTone || 'primary'"
                  (click)="emitEventClick(event, $event)">

                  <div class="schedule-calendar__event-shell">
                    <div class="schedule-calendar__event-top">
                      <div class="schedule-calendar__event-time">
                        {{ formatShortClock(event.startTime) }} - {{ formatShortClock(event.endTime) }}
                      </div>

                      <ion-badge *ngIf="event.statusLabel" [color]="event.statusTone || 'primary'" class="schedule-calendar__badge">
                        {{ event.statusLabel }}
                      </ion-badge>
                    </div>

                    <h3 class="schedule-calendar__event-title">{{ event.title }}</h3>

                    <p *ngIf="event.subtitle" class="schedule-calendar__event-subtitle">{{ event.subtitle }}</p>

                    <div *ngIf="event.meta?.length" class="schedule-calendar__meta">
                      <ion-chip *ngFor="let item of event.meta" [outline]="true" class="schedule-calendar__meta-chip">
                        {{ item }}
                      </ion-chip>
                    </div>

                    <div *ngIf="editable && event.actions?.length" class="schedule-calendar__actions" (click)="$event.stopPropagation()">
                      <button
                        *ngFor="let action of event.actions; trackBy: trackByAction"
                        type="button"
                        class="schedule-calendar__action"
                        [class.schedule-calendar__action--danger]="action.tone === 'danger'"
                        [class.schedule-calendar__action--success]="action.tone === 'success'"
                        [class.schedule-calendar__action--warning]="action.tone === 'warning'"
                        [class.schedule-calendar__action--medium]="!action.tone || action.tone === 'medium'"
                        [attr.aria-label]="action.label"
                        (click)="emitActionClick(event, action, $event)">
                        <ion-icon [name]="action.icon"></ion-icon>
                      </button>
                    </div>

                    <button
                      *ngIf="editable"
                      type="button"
                      class="schedule-calendar__selection"
                      [class.schedule-calendar__selection--on]="event.selected"
                      [attr.aria-label]="event.selected ? 'Quitar selección' : 'Seleccionar bloque'"
                      (click)="toggleSelection(event, $event)">
                      <ion-icon [name]="event.selected ? 'checkmark-circle-outline' : 'ellipse-outline'"></ion-icon>
                    </button>
                  </div>
                </article>
              </section>
            </div>
          </div>
        </ng-template>
      </div>
    </div>
  `,
    styleUrls: ['./schedule-calendar.component.scss'],
})
export class ScheduleCalendarComponent implements OnChanges {
  @Input() events: ScheduleCalendarEvent[] = [];
  @Input() visibleDays: number[] = SCHEDULE_DEFAULT_VISIBLE_DAYS;
  @Input() startMinute = SCHEDULE_DEFAULT_START_MINUTE;
  @Input() endMinute = SCHEDULE_DEFAULT_END_MINUTE;
  @Input() minuteHeight = 1;
  @Input() slotMinutes = 30;
  @Input() editable = false;
  @Input() highlightedDay: number | null = null;
  @Input() showCurrentTimeMarker = true;
  @Input() showHeaders = true;
  @Input() loaded = true;
  @Input() emptyTitle = 'No hay horarios para mostrar';
  @Input() emptySubtitle = 'Ajusta los filtros para mostrar bloques en este calendario.';
  @Input() emptyIcon = 'calendar-outline';

  @Output() eventSelected = new EventEmitter<ScheduleCalendarEvent>();
  @Output() cellSelected = new EventEmitter<ScheduleCalendarCellClick>();
  @Output() actionSelected = new EventEmitter<ScheduleCalendarActionClick>();
  @Output() selectionToggled = new EventEmitter<ScheduleCalendarEvent>();
  @Output() dayHeaderSelected = new EventEmitter<number>();

  layoutsByDay = new Map<number, ScheduleCalendarLayoutEvent[]>();
  slots: Array<{ minuteOfDay: number; top: number; height: number }> = [];
  hourMarkers: number[] = [];
  firstHourMarker = 0;
  lastHourMarker = 0;
  calendarHeight = 0;
  todayDayOfWeek = getTodayDayOfWeek();
  currentTimeTop = -1;

  get showEmptyState(): boolean {
      return this.loaded && this.events.length === 0;
  }

  ngOnChanges(changes: SimpleChanges): void {
      if (changes['events'] || changes['visibleDays'] || changes['startMinute'] || changes['endMinute'] || changes['minuteHeight'] || changes['slotMinutes']) {
          this.rebuildCalendar();
      }
  }

  rebuildCalendar(): void {
      this.calendarHeight = Math.max(1, (this.endMinute - this.startMinute) * this.minuteHeight);
      this.slots = this.buildSlots();
      this.hourMarkers = this.buildHourMarkers();
      this.firstHourMarker = this.hourMarkers[0] ?? Math.floor(this.startMinute / 60);
      this.lastHourMarker = this.hourMarkers[this.hourMarkers.length - 1] ?? Math.floor(this.endMinute / 60);
      this.layoutsByDay = this.buildLayouts();

      const now = new Date();
      const currentDay = getTodayDayOfWeek(now);
      const currentMinute = (now.getHours() * 60) + now.getMinutes();
      this.currentTimeTop = (currentDay && currentMinute >= this.startMinute && currentMinute <= this.endMinute)
          ? (currentMinute - this.startMinute) * this.minuteHeight
          : -1;
  }

  trackByDay(index: number, day: number): number {
      return day;
  }

  trackByHour(index: number, hour: number): number {
      return hour;
  }

  trackByCell(index: number, cell: { minuteOfDay: number }): number {
      return cell.minuteOfDay;
  }

  trackByLayoutEvent(index: number, event: ScheduleCalendarLayoutEvent): number {
      return event.id;
  }

  trackByAction(index: number, action: { id: string }): string {
      return action.id;
  }

  formatHour(hour: number): string {
      return `${hour.toString().padStart(2, '0')}:00`;
  }

  formatShortClock(value: string): string {
      return value ? value.substring(0, 5) : '--:--';
  }

  getDayLabel(day: number): string {
      return SCHEDULE_DAY_NAMES[normalizeDayOfWeek(day)] ?? '';
  }

  getDayShortLabel(day: number): string {
      return SCHEDULE_DAY_SHORT_NAMES[normalizeDayOfWeek(day)] ?? '';
  }

  getEventsForDay(day: number): ScheduleCalendarEvent[] {
      return this.events.filter((event) => normalizeDayOfWeek(event.dayOfWeek) === normalizeDayOfWeek(day));
  }

  getLayoutsForDay(day: number): ScheduleCalendarLayoutEvent[] {
      return this.layoutsByDay.get(normalizeDayOfWeek(day)) ?? [];
  }

  emitEventClick(event: ScheduleCalendarLayoutEvent, domEvent: MouseEvent): void {
      if ((domEvent.target as HTMLElement)?.closest('.schedule-calendar__action, .schedule-calendar__selection')) {
          return;
      }

      this.eventSelected.emit(event);
  }

  emitCellClick(dayOfWeek: number, minuteOfDay: number): void {
      this.cellSelected.emit({
          dayOfWeek: normalizeDayOfWeek(dayOfWeek),
          minuteOfDay,
          time: formatClockTime(minuteOfDay),
      });
  }

  emitActionClick(event: ScheduleCalendarLayoutEvent, action: ScheduleCalendarAction, domEvent: MouseEvent): void {
      domEvent.stopPropagation();
      this.actionSelected.emit({ event, action });
  }

  toggleSelection(event: ScheduleCalendarLayoutEvent, domEvent: MouseEvent): void {
      domEvent.stopPropagation();
      this.selectionToggled.emit(event);
  }

  emitDayHeaderClick(dayOfWeek: number): void {
      this.dayHeaderSelected.emit(normalizeDayOfWeek(dayOfWeek));
  }

  private buildSlots(): Array<{ minuteOfDay: number; top: number; height: number }> {
      const slots: Array<{ minuteOfDay: number; top: number; height: number }> = [];
      const safeSlotMinutes = Math.max(5, this.slotMinutes);

      for (let minuteOfDay = this.startMinute; minuteOfDay < this.endMinute; minuteOfDay += safeSlotMinutes) {
          slots.push({
              minuteOfDay,
              top: (minuteOfDay - this.startMinute) * this.minuteHeight,
              height: safeSlotMinutes * this.minuteHeight,
          });
      }

      return slots;
  }

  private buildHourMarkers(): number[] {
      const markers: number[] = [];
      for (let minuteOfDay = this.startMinute; minuteOfDay <= this.endMinute; minuteOfDay += 60) {
          markers.push(Math.floor(minuteOfDay / 60));
      }
      return markers;
  }

  private buildLayouts(): Map<number, ScheduleCalendarLayoutEvent[]> {
      const layouts = new Map<number, ScheduleCalendarLayoutEvent[]>();

      for (const day of this.visibleDays.map((value) => normalizeDayOfWeek(value))) {
          const dayEvents = this.events
              .filter((event) => normalizeDayOfWeek(event.dayOfWeek) === day)
              .slice()
              .sort((left, right) => {
                  const startDiff = parseClockTime(left.startTime) - parseClockTime(right.startTime);
                  if (startDiff !== 0) {
                      return startDiff;
                  }

                  return parseClockTime(left.endTime) - parseClockTime(right.endTime);
              });

          const layoutsForDay = this.layoutDayEvents(dayEvents, day);
          layouts.set(day, layoutsForDay);
      }

      return layouts;
  }

  private layoutDayEvents(events: ScheduleCalendarEvent[], day: number): ScheduleCalendarLayoutEvent[] {
      const layouts: ScheduleCalendarLayoutEvent[] = [];
      const clusters = this.splitIntoClusters(events);

      for (const cluster of clusters) {
          const laneAssignments = this.assignLanes(cluster.events);
          const laneCount = Math.max(1, laneAssignments.maxLaneCount);

          for (const assignment of laneAssignments.items) {
              const width = 100 / laneCount;
              layouts.push({
                  ...assignment.event,
                  top: Math.max(0, (assignment.startMinute - this.startMinute) * this.minuteHeight),
                  height: Math.max(28, Math.max(assignment.durationMinutes, 1) * this.minuteHeight),
                  left: assignment.lane * width,
                  width,
                  lane: assignment.lane,
                  laneCount,
                  isToday: normalizeDayOfWeek(day) === this.todayDayOfWeek,
              });
          }
      }

      return layouts;
  }

  private splitIntoClusters(events: ScheduleCalendarEvent[]): DayCluster[] {
      const clusters: DayCluster[] = [];
      let currentClusterEvents: ScheduleCalendarEvent[] = [];
      let currentClusterEnd = -1;

      for (const event of events) {
          const startMinute = parseClockTime(event.startTime);
          const endMinute = parseClockTime(event.endTime);

          if (currentClusterEvents.length === 0 || startMinute >= currentClusterEnd) {
              if (currentClusterEvents.length > 0) {
                  clusters.push({ events: currentClusterEvents, maxEnd: currentClusterEnd });
              }

              currentClusterEvents = [event];
              currentClusterEnd = endMinute;
              continue;
          }

          currentClusterEvents.push(event);
          currentClusterEnd = Math.max(currentClusterEnd, endMinute);
      }

      if (currentClusterEvents.length > 0) {
          clusters.push({ events: currentClusterEvents, maxEnd: currentClusterEnd });
      }

      return clusters;
  }

  private assignLanes(events: ScheduleCalendarEvent[]): {
    items: Array<{ event: ScheduleCalendarEvent; lane: number; startMinute: number; endMinute: number; durationMinutes: number }>;
    maxLaneCount: number;
  } {
      const activeLanes: Array<{ lane: number; endMinute: number }> = [];
      const freeLanes: number[] = [];
      const items: Array<{ event: ScheduleCalendarEvent; lane: number; startMinute: number; endMinute: number; durationMinutes: number }> = [];
      let nextLane = 0;
      let maxLaneCount = 0;

      for (const event of events) {
          const startMinute = parseClockTime(event.startTime);
          const endMinute = parseClockTime(event.endTime);

          for (let index = activeLanes.length - 1; index >= 0; index -= 1) {
              if (activeLanes[index].endMinute <= startMinute) {
                  freeLanes.push(activeLanes[index].lane);
                  activeLanes.splice(index, 1);
              }
          }

          freeLanes.sort((left, right) => left - right);

          const lane = freeLanes.length > 0 ? freeLanes.shift()! : nextLane++;
          activeLanes.push({ lane, endMinute });
          maxLaneCount = Math.max(maxLaneCount, activeLanes.length);

          items.push({
              event,
              lane,
              startMinute,
              endMinute,
              durationMinutes: Math.max(1, endMinute - startMinute),
          });
      }

      return { items, maxLaneCount };
  }
}

addIcons({
    calendarOutline,
    checkmarkCircleOutline,
    ellipseOutline,
});
