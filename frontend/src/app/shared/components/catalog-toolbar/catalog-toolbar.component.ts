import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonIcon, IonSearchbar, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { refreshOutline } from 'ionicons/icons';
import {
    CatalogToolbarFilterConfig,
    CatalogToolbarSortOption,
    CatalogToolbarState,
} from '../../utils/catalog-query';

addIcons({ refreshOutline });

@Component({
    selector: 'app-catalog-toolbar',
    standalone: true,
    imports: [CommonModule, IonButton, IonCard, IonCardContent, IonIcon, IonSearchbar, IonSelect, IonSelectOption],
    templateUrl: './catalog-toolbar.component.html',
    styleUrls: ['./catalog-toolbar.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogToolbarComponent {
    @Input() state: CatalogToolbarState = {
        searchQuery: '',
        sortValue: '',
        filters: {},
    };

    @Input() searchPlaceholder = 'Buscar...';
    @Input() sortPlaceholder = 'Ordenar por';
    @Input() clearLabel = 'Restablecer';
    @Input() filters: CatalogToolbarFilterConfig[] = [];
    @Input() sortOptions: CatalogToolbarSortOption[] = [];
    @Input() selectInterfaceOptions: Record<string, unknown> = { animated: false };

    @Output() stateChange = new EventEmitter<CatalogToolbarState>();

    onSearchInput(event: CustomEvent<{ value?: string | null }>): void {
        this.stateChange.emit({
            ...this.state,
            searchQuery: event.detail?.value ?? '',
        });
    }

    onSortChange(event: CustomEvent<{ value?: string | null }>): void {
        this.stateChange.emit({
            ...this.state,
            sortValue: event.detail?.value ?? '',
        });
    }

    onFilterChange(filterKey: string, event: CustomEvent<{ value?: string | null }>): void {
        this.stateChange.emit({
            ...this.state,
            filters: {
                ...this.state.filters,
                [filterKey]: event.detail?.value ?? '',
            },
        });
    }

    getFilterValue(filter: CatalogToolbarFilterConfig): string {
        return this.state.filters[filter.key] ?? filter.defaultValue ?? '';
    }

    clearState(): void {
        const clearedFilters = this.filters.reduce<Record<string, string>>((accumulator, filter) => {
            accumulator[filter.key] = filter.defaultValue ?? '';
            return accumulator;
        }, {});

        this.stateChange.emit({
            searchQuery: '',
            sortValue: '',
            filters: clearedFilters,
        });
    }

    get hasActiveState(): boolean {
        if (this.state.searchQuery.trim().length > 0) {
            return true;
        }

        if (this.state.sortValue !== '') {
            return true;
        }

        return this.filters.some((filter) => {
            const currentValue = this.state.filters?.[filter.key] ?? '';
            const defaultValue = filter.defaultValue ?? '';

            return currentValue !== defaultValue;
        });
    }

    trackByFilterKey(index: number, filter: CatalogToolbarFilterConfig): string {
        return `${filter.key}-${index}`;
    }

    trackByOptionValue(index: number, option: CatalogToolbarSortOption): string {
        return `${option.value}-${index}`;
    }
}
