import { Component, Input, ViewEncapsulation, HostListener, inject, ChangeDetectorRef } from '@angular/core';
import { signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

@Component({
    selector: 'app-auth-card',
    exportAs: 'appAuthCard',
    standalone: true,
    encapsulation: ViewEncapsulation.None,
    imports: [CommonModule, IonCard, IonCardContent],
    templateUrl: './auth-card.component.html',
    styleUrls: ['./auth-card.component.scss']
})
export class AuthCardComponent {
    @Input() cardTitle = '';
    @Input() subtitle = '';
    @Input() cardClass = '';

    isEmailPopoverVisible: boolean = false;

    get isTouchMode(): boolean {
        return window.matchMedia('(hover: none), (pointer: coarse)').matches;
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: Event): void {
        if (!this.isTouchMode || !this.isEmailPopoverVisible) {
            return;
        }

        const target = event.target as HTMLElement | null;
        if (!target || !target.closest('.email-validation-container')) {
            this.isEmailPopoverVisible = false;
        }
    }

    private cdr = inject(ChangeDetectorRef);

    private lockoutRemainingSecondsSignal = signal(0);
    private lockoutIntervalId: number | null = null;

    get lockoutRemainingSeconds(): number {
        return this.lockoutRemainingSecondsSignal();
    }

    get isLockoutActive(): boolean {
        return this.lockoutRemainingSeconds > 0;
    }

    getActionButtonLabel(baseLabel: string, isLoading = false): string {
        if (this.isLockoutActive) {
            return `${baseLabel} (${this.lockoutRemainingSeconds}s)`;
        }
        return isLoading ? 'Cargando...' : baseLabel;
    }

    startLockoutCountdown(seconds: number): void {
        this.clearLockoutCountdown();
        this.lockoutRemainingSecondsSignal.set(seconds);

        this.lockoutIntervalId = window.setInterval(() => {
            const next = Math.max(this.lockoutRemainingSeconds - 1, 0);
            this.lockoutRemainingSecondsSignal.set(next);
            this.cdr.markForCheck();

            if (next <= 0) {
                this.clearLockoutCountdown();
            }
        }, 1000);
    }

    clearLockoutCountdown(): void {
        if (this.lockoutIntervalId !== null) {
            clearInterval(this.lockoutIntervalId);
            this.lockoutIntervalId = null;
        }
        this.lockoutRemainingSecondsSignal.set(0);
        this.cdr.markForCheck();
    }

    toggleEmailPopover(event: Event): void {
        if (!this.isTouchMode) {
            return;
        }

        event.stopPropagation();
        event.preventDefault();
        this.isEmailPopoverVisible = !this.isEmailPopoverVisible;
    }

    public getEmailValidationMessage(emailControl: AbstractControl | null): string {
        if (!emailControl) {
            return 'Formato inválido';
        }

        if (emailControl.hasError('required')) {
            return 'Campo vacío';
        }

        if (emailControl.hasError('email') || emailControl.hasError('pattern')) {
            return 'Formato inválido';
        }

        return 'Correo válido';
    }
}
