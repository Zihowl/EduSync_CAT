import { CommonModule } from '@angular/common';
import { Component, ContentChild, EventEmitter, Input, OnInit, Output, TemplateRef } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonButton, IonIcon, IonModal } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { inject, DestroyRef } from '@angular/core';

@Component({
    selector: 'app-modal',
    standalone: true,
    imports: [CommonModule, IonModal, IonButton, IonIcon],
    templateUrl: './modal.component.html',
    styleUrls: ['./modal.component.scss']
})
export class ModalComponent implements OnInit {
    private router = inject(Router);
    private destroyRef = inject(DestroyRef);

  @Input() isOpen = false;
  @Output() isOpenChange = new EventEmitter<boolean>();

  @Input() title = '';
  @Input() subtitle = '';
  @Input() helperText = '';
  @Input() saveLabel = 'Guardar';
  @Input() saveDisabled = false;
  @Input() backdropDismiss = true;

  @Output() save = new EventEmitter<void>();

  /** Template reference for the form body content */
  @ContentChild('modalBody', { static: false }) bodyTemplate!: TemplateRef<any>;

  ngOnInit(): void {
      addIcons({ closeOutline });

      this.router.events
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((event) => {
              if (event instanceof NavigationStart && this.isOpen) {
                  this.close();
              }
          });
  }

  close(): void {
      this.isOpenChange.emit(false);
  }

  handleDidDismiss(): void {
      this.close();
  }
}