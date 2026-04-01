import { Component, Input, ViewEncapsulation, HostListener } from '@angular/core';
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

    toggleEmailPopover(event: Event): void {
        if (!this.isTouchMode) {
            return;
        }

        event.stopPropagation();
        event.preventDefault();
        this.isEmailPopoverVisible = !this.isEmailPopoverVisible;
    }
}
