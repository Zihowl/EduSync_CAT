import { Component, Input, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

@Component({
    selector: 'app-auth-card',
    standalone: true,
    encapsulation: ViewEncapsulation.None,
    imports: [CommonModule, IonCard, IonCardContent],
    templateUrl: './auth-card.component.html',
    styleUrls: ['./auth-card.component.scss']
})
export class AuthCardComponent {
    @Input() title = '';
    @Input() subtitle = '';
    @Input() cardClass = '';
}
