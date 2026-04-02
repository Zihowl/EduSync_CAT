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

    activePopoverField: string | null = null;

    get isTouchMode(): boolean {
        return window.matchMedia('(hover: none), (pointer: coarse)').matches;
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: Event): void {
        if (!this.isTouchMode || !this.activePopoverField) {
            return;
        }

        const target = event.target as HTMLElement | null;
        if (!target || !target.closest('.field-validation-container')) {
            this.activePopoverField = null;
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

    getPopoverVisible(field: string): boolean {
        if (!this.isTouchMode) {
            return false;
        }
        return this.activePopoverField === field;
    }

    toggleFieldPopover(event: Event, field: string): void {
        if (!this.isTouchMode) {
            return;
        }

        event.stopPropagation();
        event.preventDefault();
        this.activePopoverField = this.activePopoverField === field ? null : field;
    }

    public getFieldValidationMessage(control: AbstractControl | null, type: 'email' | 'password' | 'confirm_password' = 'password'): string {
        if (!control) {
            return '';
        }

        if (control.hasError('required')) {
            return 'Campo vacío';
        }

        if (type === 'email') {
            if (control.hasError('forbiddenDomain')) {
                return 'El dominio @setup.local no está permitido';
            }
            if (control.hasError('invalidExtension')) {
                return 'Extensión inválida';
            }
            if (control.hasError('email') || control.hasError('pattern')) {
                return 'Formato inválido';
            }
        }

        if (type === 'password') {
            if (control.hasError('sameAsCurrent')) {
                return 'La nueva contraseña no puede ser igual a la actual';
            }
            if (control.hasError('minlength')) {
                return 'La contraseña debe tener al menos 8 caracteres.';
            }
            if (control.hasError('weakPassword')) {
                return 'Debe incluir al menos 3 de: mayúsculas, minúsculas, números, símbolos.';
            }
        }

        if (type === 'confirm_password') {
            if (control.parent?.hasError('passwordMismatch')) {
                return 'Las contraseñas no coinciden.';
            }
        }

        return '';
    }
}
