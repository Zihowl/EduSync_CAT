import { Directive, ElementRef, HostListener, Input, OnInit, Renderer2 } from '@angular/core';

@Directive({
    selector: '[appDraggable]',
    standalone: true,
})
export class DraggableDirective implements OnInit {
    @Input() dragHandleSelector = '.draggable-handle';
    @Input() initialTop = '50%';
    @Input() initialLeft = '50%';

    private isDragging = false;
    private startMouseX = 0;
    private startMouseY = 0;
    private currentMouseX = 0;
    private currentMouseY = 0;
    private offsetX = 0;
    private offsetY = 0;
    private dragHandle: HTMLElement | null = null;

    constructor(private el: ElementRef<HTMLElement>, private renderer: Renderer2) {}

    ngOnInit() {
        const host = this.el.nativeElement;
        this.renderer.setStyle(host, 'position', 'fixed');
        this.renderer.setStyle(host, 'top', this.initialTop);
        this.renderer.setStyle(host, 'left', this.initialLeft);
        this.renderer.setStyle(host, 'transform', 'translate(-50%, -50%)');
    }

    private getDragHandle(): HTMLElement | null {
        if (this.dragHandle) {
            return this.dragHandle;
        }
        const host = this.el.nativeElement;
        this.dragHandle = this.dragHandleSelector
            ? host.querySelector(this.dragHandleSelector)
            : host;
        if (this.dragHandle) {
            this.renderer.setStyle(this.dragHandle, 'cursor', 'move');
        }
        return this.dragHandle;
    }

    @HostListener('mousedown', ['$event'])
    onMouseDown(event: MouseEvent) {
        const handle = this.getDragHandle();
        if (handle && !handle.contains(event.target as Node)) {
            return;
        }
        this.isDragging = true;
        this.startMouseX = event.clientX;
        this.startMouseY = event.clientY;
        this.currentMouseX = event.clientX;
        this.currentMouseY = event.clientY;
        event.preventDefault();
    }

    @HostListener('document:mousemove', ['$event'])
    onMouseMove(event: MouseEvent) {
        if (!this.isDragging) return;
        this.currentMouseX = event.clientX;
        this.currentMouseY = event.clientY;
        const dx = this.currentMouseX - this.startMouseX;
        const dy = this.currentMouseY - this.startMouseY;
        this.renderer.setStyle(this.el.nativeElement, 'margin-left', `${this.offsetX + dx}px`);
        this.renderer.setStyle(this.el.nativeElement, 'margin-top', `${this.offsetY + dy}px`);
    }

    @HostListener('document:mouseup')
    onMouseUp() {
        if (!this.isDragging) return;
        this.offsetX += this.currentMouseX - this.startMouseX;
        this.offsetY += this.currentMouseY - this.startMouseY;
        this.isDragging = false;
    }

    @HostListener('touchstart', ['$event'])
    onTouchStart(event: TouchEvent) {
        const handle = this.getDragHandle();
        if (handle && !handle.contains(event.target as Node)) {
            return;
        }
        const touch = event.touches[0];
        this.isDragging = true;
        this.startMouseX = touch.clientX;
        this.startMouseY = touch.clientY;
        this.currentMouseX = touch.clientX;
        this.currentMouseY = touch.clientY;
    }

    @HostListener('document:touchmove', ['$event'])
    onTouchMove(event: TouchEvent) {
        if (!this.isDragging) return;
        const touch = event.touches[0];
        this.currentMouseX = touch.clientX;
        this.currentMouseY = touch.clientY;
        const dx = this.currentMouseX - this.startMouseX;
        const dy = this.currentMouseY - this.startMouseY;
        this.renderer.setStyle(this.el.nativeElement, 'margin-left', `${this.offsetX + dx}px`);
        this.renderer.setStyle(this.el.nativeElement, 'margin-top', `${this.offsetY + dy}px`);
    }

    @HostListener('document:touchend')
    onTouchEnd() {
        if (!this.isDragging) return;
        this.offsetX += this.currentMouseX - this.startMouseX;
        this.offsetY += this.currentMouseY - this.startMouseY;
        this.isDragging = false;
    }
}
