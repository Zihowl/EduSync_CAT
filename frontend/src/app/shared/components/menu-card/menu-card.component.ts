import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
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
    selector: 'a[app-menu-card]',
    standalone: true,
    imports: [IonIcon, IonRippleEffect],
    templateUrl: './menu-card.component.html',
    styleUrls: ['./menu-card.component.scss'],
    host: {
        class: 'menu-card ion-activatable ripple-parent',
        '[attr.aria-label]': 'ariaLabel',
    },
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuCardComponent {
    @Input() card!: MenuCardData;

    get ariaLabel(): string {
        return this.card ? `Abrir ${this.card.title}` : 'Abrir tarjeta';
    }
}