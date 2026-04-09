import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronForwardOutline } from 'ionicons/icons';

export interface MenuCardData {
    title: string;
    description: string;
    icon: string;
    route: string;
}

addIcons({ chevronForwardOutline });

@Component({
    selector: 'app-menu-card',
    standalone: true,
    imports: [CommonModule, RouterLink, IonIcon, IonRippleEffect],
    templateUrl: './menu-card.component.html',
    styleUrls: ['./menu-card.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuCardComponent {
    @Input() card!: MenuCardData;
}