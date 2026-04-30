import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonIcon,
    IonButtons,
} from '@ionic/angular/standalone';
import { PopoverController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { searchOutline } from 'ionicons/icons';

type MissingCatalogType = 'subject' | 'teacher' | 'building' | 'classroom';

interface UploadPreviewRow {
    rowNumber: number;
    claveMateria: string;
    materia: string;
    grade: number | null;
    noEmpleado: string;
    docente: string;
    grupo: string;
    subgroup: string | null;
    aula: string;
    edificio: string;
    dia: string;
    horaInicio: string;
    horaFin: string;
    errors: string[];
    warnings?: string[];
}

interface MissingCatalogItem {
    type: MissingCatalogType;
    key: string;
    row: UploadPreviewRow;
    rowNumbers: number[];
}

@Component({
    selector: 'app-missing-items-popover',
    standalone: true,
    imports: [CommonModule, FormsModule, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonIcon, IonButtons],
    templateUrl: './missing-items-popover.component.html',
    styleUrls: ['./missing-items-popover.component.scss']
})
export class MissingItemsPopoverComponent {
    @Input() missingSubjects: MissingCatalogItem[] = [];
    @Input() missingTeachers: MissingCatalogItem[] = [];
    @Input() missingBuildings: MissingCatalogItem[] = [];
    @Input() missingClassrooms: MissingCatalogItem[] = [];

    @Input() activeCategory: MissingCatalogType | 'all' = 'all';
    @Output() closed = new EventEmitter<any>();
    searchText = '';

    private popoverCtrl = inject(PopoverController);
    private readonly categoryCopy: Record<MissingCatalogType | 'all', { title: string; plural: string; hint: string }> = {
        all: {
            title: 'Catálogos faltantes',
            plural: 'elementos',
            hint: 'Revisa los elementos detectados en el archivo.',
        },
        subject: {
            title: 'Materias faltantes',
            plural: 'materias',
            hint: 'Materias nuevas detectadas por clave y nombre.',
        },
        teacher: {
            title: 'Docentes faltantes',
            plural: 'docentes',
            hint: 'Docentes nuevos detectados por número de empleado.',
        },
        building: {
            title: 'Edificios faltantes',
            plural: 'edificios',
            hint: 'Edificios nuevos requeridos por las aulas del archivo.',
        },
        classroom: {
            title: 'Aulas faltantes',
            plural: 'aulas',
            hint: 'Aulas nuevas vinculadas a su edificio correspondiente.',
        },
    };

    constructor() {
        addIcons({ searchOutline });
    }

    dismiss(result?: any) {
        this.closed.emit(result);
        try {
            this.popoverCtrl.dismiss(result);
        } catch (e) {}
    }

    flattenItems(): MissingCatalogItem[] {
        return [...this.missingSubjects, ...this.missingTeachers, ...this.missingBuildings, ...this.missingClassrooms];
    }

    itemsForActiveCategory(): MissingCatalogItem[] {
        if (this.activeCategory === 'all') return this.flattenItems().filter(i => this.matchesSearch(i));
        return this.itemsForCategory(this.activeCategory).filter(i => this.matchesSearch(i));
    }

    itemsForCategory(category: MissingCatalogType): MissingCatalogItem[] {
        const map: Record<string, MissingCatalogItem[]> = {
            subject: this.missingSubjects,
            teacher: this.missingTeachers,
            building: this.missingBuildings,
            classroom: this.missingClassrooms,
        } as any;
        return map[category] ?? [];
    }

    activeTitle(): string {
        return this.categoryCopy[this.activeCategory].title;
    }

    activeHint(): string {
        return this.categoryCopy[this.activeCategory].hint;
    }

    activeTotal(): number {
        return this.activeCategory === 'all' ? this.flattenItems().length : this.itemsForCategory(this.activeCategory).length;
    }

    activePlural(): string {
        return this.categoryCopy[this.activeCategory].plural;
    }

    metaFor(item: MissingCatalogItem): string {
        switch (item.type) {
            case 'subject': return `Clave ${item.row.claveMateria || 'N/D'} · Grado ${item.row.grade ?? 'N/D'} · Grupo ${this.groupLabel(item)}`;
            case 'teacher': return `Empleado ${item.row.noEmpleado || 'N/D'} · ${this.scheduleLabel(item)}`;
            case 'building': return `${this.classroomsForBuilding(item.row.edificio)} aulas relacionadas`;
            case 'classroom': return `Edificio ${item.row.edificio || 'N/D'} · ${this.scheduleLabel(item)}`;
        }
        return item.key;
    }

    detailsFor(item: MissingCatalogItem): string {
        switch (item.type) {
            case 'subject': return item.row.materia || 'Sin nombre de materia';
            case 'teacher': return item.row.docente || 'Sin nombre de docente';
            case 'building': return this.relatedClassroomsLabel(item.row.edificio);
            case 'classroom': return `Aula ${item.row.aula || 'N/D'} · ${this.groupLabel(item)}`;
        }
        return item.key;
    }

    rowsLabel(item: MissingCatalogItem): string {
        const rows = [...new Set(item.rowNumbers)].sort((a, b) => a - b);
        const visibleRows = rows.slice(0, 4).join(', ');
        const suffix = rows.length > 4 ? ` +${rows.length - 4}` : '';
        return `Filas ${visibleRows}${suffix}`;
    }

    private matchesSearch(item: MissingCatalogItem): boolean {
        if (!this.searchText) return true;
        const t = this.searchText.toLowerCase();
        const searchable = [
            this.labelFor(item),
            this.metaFor(item),
            item.row?.materia,
            item.row?.docente,
            item.row?.aula,
            item.row?.edificio,
            item.key,
        ].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(t);
    }

    labelFor(item: MissingCatalogItem): string {
        switch (item.type) {
            case 'subject': return `${item.row.claveMateria} — ${item.row.materia || 'Sin nombre'}`;
            case 'teacher': return `${item.row.noEmpleado} — ${item.row.docente || 'Sin nombre'}`;
            case 'building': return `${item.row.edificio}`;
            case 'classroom': return `${item.row.aula} — ${item.row.edificio}`;
        }
        return item.key;
    }

    private classroomsForBuilding(building: string): number {
        const buildingKey = building?.toLowerCase().trim();
        if (!buildingKey) return 0;
        return this.missingClassrooms.filter(item => item.row.edificio?.toLowerCase().trim() === buildingKey).length;
    }

    private relatedClassroomsLabel(building: string): string {
        const buildingKey = building?.toLowerCase().trim();
        if (!buildingKey) return 'Sin aulas relacionadas';
        const classrooms = this.missingClassrooms
            .filter(item => item.row.edificio?.toLowerCase().trim() === buildingKey)
            .map(item => item.row.aula)
            .filter(Boolean);
        if (classrooms.length === 0) return 'Sin aulas relacionadas';
        const visible = [...new Set(classrooms)].slice(0, 3).join(', ');
        const suffix = classrooms.length > 3 ? ` +${classrooms.length - 3}` : '';
        return `Aulas: ${visible}${suffix}`;
    }

    private groupLabel(item: MissingCatalogItem): string {
        const group = item.row.grupo || 'N/D';
        return item.row.subgroup ? `${group}-${item.row.subgroup}` : group;
    }

    private scheduleLabel(item: MissingCatalogItem): string {
        const day = item.row.dia || 'Día N/D';
        const start = item.row.horaInicio || '--:--';
        const end = item.row.horaFin || '--:--';
        return `${day} ${start}-${end}`;
    }
}
