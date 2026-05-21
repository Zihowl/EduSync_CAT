import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronUpOutline, chevronDownOutline } from 'ionicons/icons';

@Component({
    selector: 'app-time-picker',
    standalone: true,
    imports: [CommonModule, IonIcon],
    templateUrl: './time-picker.component.html',
    styleUrls: ['./time-picker.component.scss']
})
export class TimePickerComponent implements OnChanges {
    @Input() value = '08:00';
    @Input() minuteStep = 5;
    @Output() valueChange = new EventEmitter<string>();

    hour = 8;
    minute = 0;
    isPM = false;

    constructor() {
        addIcons({ chevronUpOutline, chevronDownOutline });
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['value']) this.parseValue(this.value);
    }

    private parseValue(val: string): void {
        const [h, m] = val.split(':').map(Number);
        const hour24 = isNaN(h) ? 8 : h;
        this.minute = isNaN(m) ? 0 : m;
        this.isPM = hour24 >= 12;
        this.hour = hour24 % 12 || 12;
    }

    private get hour24(): number {
        if (this.isPM) return this.hour === 12 ? 12 : this.hour + 12;
        return this.hour === 12 ? 0 : this.hour;
    }

    private emit(): void {
        const hh = String(this.hour24).padStart(2, '0');
        const mm = String(this.minute).padStart(2, '0');
        this.valueChange.emit(`${hh}:${mm}`);
    }

    pad(n: number): string {
        return String(n).padStart(2, '0');
    }

    incHour(): void {
        this.hour = this.hour >= 12 ? 1 : this.hour + 1;
        this.emit();
    }

    decHour(): void {
        this.hour = this.hour <= 1 ? 12 : this.hour - 1;
        this.emit();
    }

    incMin(): void {
        this.minute = (this.minute + this.minuteStep) % 60;
        this.emit();
    }

    decMin(): void {
        this.minute = ((this.minute - this.minuteStep) % 60 + 60) % 60;
        this.emit();
    }

    togglePM(): void {
        this.isPM = !this.isPM;
        this.emit();
    }

    onHourWheel(e: WheelEvent): void {
        e.preventDefault();
        e.deltaY < 0 ? this.incHour() : this.decHour();
    }

    onMinWheel(e: WheelEvent): void {
        e.preventDefault();
        e.deltaY < 0 ? this.incMin() : this.decMin();
    }

    onHourKey(e: KeyboardEvent): void {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.incHour();
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.decHour();
        }
    }

    onMinKey(e: KeyboardEvent): void {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.incMin();
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.decMin();
        }
    }

    onHourInput(e: Event): void {
        const v = parseInt((e.target as HTMLInputElement).value, 10);
        if (!isNaN(v) && v >= 1 && v <= 12) {
            this.hour = v;
            this.emit();
        }
    }

    onMinInput(e: Event): void {
        const raw = parseInt((e.target as HTMLInputElement).value, 10);
        const v = Math.round(raw / this.minuteStep) * this.minuteStep;
        if (!isNaN(v) && v >= 0 && v < 60) {
            this.minute = v;
            this.emit();
        }
    }
}
