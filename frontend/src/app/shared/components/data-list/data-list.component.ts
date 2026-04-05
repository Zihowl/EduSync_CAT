import { CommonModule } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    ContentChild,
    Input,
    TrackByFunction,
    TemplateRef,
} from '@angular/core';
import {
    IonCard,
    IonCardContent,
    IonList,
    IonIcon,
    IonSpinner,
} from '@ionic/angular/standalone';

@Component({
    selector: 'app-data-list',
    standalone: true,
    imports: [
        CommonModule,
        IonCard,
        IonCardContent,
        IonList,
        IonIcon,
        IonSpinner,
    ],
    templateUrl: './data-list.component.html',
    styleUrls: ['./data-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataListComponent {
    /** The data items to render. */
    @Input() items: any[] = [];

    /** Optional `trackBy` function for the rendered list items. */
    @Input() trackByFn: TrackByFunction<any> | null = null;

    /** Whether the list should render inside an outer card. */
    @Input() showCard = true;

    /** Whether data has finished loading. */
    @Input() loaded = false;

    /** Title shown above the list (e.g. "Dominios registrados"). 
     *  Use `{count}` as a placeholder for the item count. */
    @Input() title = '';

    /** Text for the loading spinner. */
    @Input() loadingText = 'Cargando...';

    /** Icon for the empty state. */
    @Input() emptyIcon = 'information-circle-outline';

    /** Headline for the empty state. */
    @Input() emptyTitle = 'Sin datos';

    /** Subtitle for the empty state. */
    @Input() emptySubtitle = '';

    /** CSS class to add to the outer card (e.g. 'domains-list-card'). */
    @Input() cardClass = '';

    /** Template reference for each item row. Context: { $implicit: item, index: number } */
    @ContentChild('itemTemplate', { static: false }) itemTemplate!: TemplateRef<any>;

    readonly defaultTrackBy: TrackByFunction<any> = (_index: number, item: any) => item?.id ?? item;

    get resolvedTitle(): string {
        return this.title.replace('{count}', String(this.items.length));
    }
}
