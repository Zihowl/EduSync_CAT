import { AfterViewInit, Directive, ElementRef, OnDestroy, Renderer2 } from '@angular/core';
import { addIcons } from 'ionicons';
import { defineCustomElement as defineIonIcon } from 'ionicons/components/ion-icon.js';
import { eyeOffOutline, eyeOutline } from 'ionicons/icons';

/**
 * Agrega un botón de mostrar/ocultar contraseña a un <input type="password">.
 * Envuelve el input en un contenedor .password-field (position: relative) y
 * coloca el botón a la derecha, alternando el tipo del input.
 */
@Directive({
    selector: 'input[appPasswordToggle]',
    standalone: true,
})
export class PasswordToggleDirective implements AfterViewInit, OnDestroy {
    private button?: HTMLButtonElement;
    private icon?: HTMLElement;
    private wrapper?: HTMLElement;
    private clickListener?: () => void;
    private visible = false;

    constructor(private el: ElementRef<HTMLInputElement>, private renderer: Renderer2) {
        defineIonIcon();
        addIcons({ eyeOutline, eyeOffOutline });
    }

    ngAfterViewInit(): void {
        const input = this.el.nativeElement;
        const parent = input.parentNode;
        if (!parent) {
            return;
        }

        this.renderer.addClass(input, 'has-toggle');

        const wrapper = this.renderer.createElement('div') as HTMLElement;
        this.renderer.addClass(wrapper, 'password-field');
        this.renderer.insertBefore(parent, wrapper, input);
        this.renderer.appendChild(wrapper, input);

        const button = this.renderer.createElement('button') as HTMLButtonElement;
        this.renderer.setAttribute(button, 'type', 'button');
        this.renderer.setAttribute(button, 'tabindex', '-1');
        this.renderer.addClass(button, 'password-toggle');

        const icon = this.renderer.createElement('ion-icon') as HTMLElement;
        this.renderer.setAttribute(icon, 'aria-hidden', 'true');
        this.renderer.appendChild(button, icon);
        this.renderer.appendChild(wrapper, button);

        this.wrapper = wrapper;
        this.button = button;
        this.icon = icon;

        this.clickListener = this.renderer.listen(button, 'click', () => this.toggle());

        this.applyState();
    }

    private toggle(): void {
        this.visible = !this.visible;
        this.applyState();
        this.el.nativeElement.focus();
    }

    private applyState(): void {
        const input = this.el.nativeElement;
        this.renderer.setAttribute(input, 'type', this.visible ? 'text' : 'password');

        if (this.icon) {
            this.renderer.setAttribute(this.icon, 'name', this.visible ? 'eye-off-outline' : 'eye-outline');
        }

        if (this.button) {
            this.renderer.setAttribute(this.button, 'aria-pressed', String(this.visible));
            this.renderer.setAttribute(
                this.button,
                'aria-label',
                this.visible ? 'Ocultar contraseña' : 'Mostrar contraseña',
            );
        }
    }

    ngOnDestroy(): void {
        this.clickListener?.();
        if (this.wrapper?.parentNode) {
            this.renderer.removeChild(this.wrapper.parentNode, this.wrapper);
        }
    }
}
