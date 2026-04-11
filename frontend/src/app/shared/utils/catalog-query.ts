const CATALOG_TEXT_COLLATOR = new Intl.Collator('es', {
    sensitivity: 'base',
    numeric: true,
});

export interface CatalogToolbarState {
    searchQuery: string;
    sortValue: string;
    sortDirection?: 'asc' | 'desc';
    filters: Record<string, string>;
}

export interface CatalogToolbarFilterOption {
    label: string;
    value: string;
}

export interface CatalogToolbarFilterConfig {
    key: string;
    label: string;
    placeholder?: string;
    defaultValue?: string;
    options: CatalogToolbarFilterOption[];
}

export interface CatalogToolbarSortOption {
    label: string;
    value: string;
}

export interface CatalogQueryConfig<T> {
    searchFields?: Array<(item: T) => unknown>;
    searchPredicate?: (item: T, normalizedQuery: string) => boolean;
    filterPredicates?: Record<string, (item: T, value: string) => boolean>;
    sortPredicates?: Record<string, (left: T, right: T) => number>;
    defaultSort?: string;
    fallbackSort?: (left: T, right: T) => number;
}

export function normalizeCatalogText(value: unknown): string {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

export function compareCatalogText(left: unknown, right: unknown): number {
    return CATALOG_TEXT_COLLATOR.compare(
        normalizeCatalogText(left),
        normalizeCatalogText(right),
    );
}

export function matchesCatalogText(value: unknown, query: string): boolean {
    const normalizedQuery = normalizeCatalogText(query);

    if (!normalizedQuery) {
        return true;
    }

    return normalizeCatalogText(value).includes(normalizedQuery);
}

export function applyCatalogQuery<T>(
    items: T[],
    state: CatalogToolbarState,
    config: CatalogQueryConfig<T> = {},
): T[] {
    const normalizedQuery = normalizeCatalogText(state.searchQuery);
    const searchFields = config.searchFields ?? [];
    const filterPredicates = config.filterPredicates ?? {};

    const filteredItems = items.filter((item) => {
        if (normalizedQuery.length > 0) {
            if (config.searchPredicate) {
                if (!config.searchPredicate(item, normalizedQuery)) {
                    return false;
                }
            } else if (searchFields.length > 0) {
                const matchesAnyField = searchFields.some((getFieldValue) =>
                    matchesCatalogText(getFieldValue(item), normalizedQuery),
                );

                if (!matchesAnyField) {
                    return false;
                }
            }
        }

        for (const [filterKey, predicate] of Object.entries(filterPredicates)) {
            const filterValue = state.filters?.[filterKey];

            if (filterValue == null || String(filterValue).trim() === '' || String(filterValue).trim() === '__all__') {
                continue;
            }

            if (!predicate(item, String(filterValue))) {
                return false;
            }
        }

        return true;
    });

    const sortKey = state.sortValue || config.defaultSort || '';
    const sorter = config.sortPredicates?.[sortKey] ?? config.fallbackSort;

    if (!sorter) {
        return filteredItems;
    }

    const isDesc = state.sortDirection === 'desc';

    return filteredItems
        .map((item, index) => ({ item, index }))
        .sort((left, right) => {
            const comparison = sorter(left.item, right.item);

            if (comparison !== 0) {
                return isDesc ? -comparison : comparison;
            }

            return left.index - right.index;
        })
        .map(({ item }) => item);
}
