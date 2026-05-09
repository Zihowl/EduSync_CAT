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
    private offsetX = 0;
    private offsetY = 0;
    private lastAppliedDx = 0;
    private lastAppliedDy = 0;
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

    /**
     * Aplica el delta solicitado clampeado contra el viewport.
     * Devuelve el delta efectivamente aplicado para que el caller pueda acumular offsets sin saltos.
     */
    private applyClampedDrag(dx: number, dy: number): { effDx: number; effDy: number } {
        const host = this.el.nativeElement;
        const rect = host.getBoundingClientRect();

        const currentMarginLeft = this.offsetX + this.lastAppliedDx;
        const currentMarginTop = this.offsetY + this.lastAppliedDy;
        const proposedMarginLeft = this.offsetX + dx;
        const proposedMarginTop = this.offsetY + dy;

        const proposedLeft = rect.left + (proposedMarginLeft - currentMarginLeft);
        const proposedTop = rect.top + (proposedMarginTop - currentMarginTop);

        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - rect.height);

        const clampedLeft = Math.max(0, Math.min(proposedLeft, maxLeft));
        const clampedTop = Math.max(0, Math.min(proposedTop, maxTop));

        const correctionX = clampedLeft - proposedLeft;
        const correctionY = clampedTop - proposedTop;
        const effDx = dx + correctionX;
        const effDy = dy + correctionY;

        this.renderer.setStyle(host, 'margin-left', `${this.offsetX + effDx}px`);
        this.renderer.setStyle(host, 'margin-top', `${this.offsetY + effDy}px`);

        this.lastAppliedDx = effDx;
        this.lastAppliedDy = effDy;

        return { effDx, effDy };
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
        this.lastAppliedDx = 0;
        this.lastAppliedDy = 0;
        event.preventDefault();
    }

    @HostListener('document:mousemove', ['$event'])
    onMouseMove(event: MouseEvent) {
        if (!this.isDragging) return;
        const dx = event.clientX - this.startMouseX;
        const dy = event.clientY - this.startMouseY;
        this.applyClampedDrag(dx, dy);
    }

    @HostListener('document:mouseup')
    onMouseUp() {
        if (!this.isDragging) return;
        this.offsetX += this.lastAppliedDx;
        this.offsetY += this.lastAppliedDy;
        this.lastAppliedDx = 0;
        this.lastAppliedDy = 0;
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
        this.lastAppliedDx = 0;
        this.lastAppliedDy = 0;
    }

    @HostListener('document:touchmove', ['$event'])
    onTouchMove(event: TouchEvent) {
        if (!this.isDragging) return;
        const touch = event.touches[0];
        const dx = touch.clientX - this.startMouseX;
        const dy = touch.clientY - this.startMouseY;
        this.applyClampedDrag(dx, dy);
    }

    @HostListener('document:touchend')
    onTouchEnd() {
        if (!this.isDragging) return;
        this.offsetX += this.lastAppliedDx;
        this.offsetY += this.lastAppliedDy;
        this.lastAppliedDx = 0;
        this.lastAppliedDy = 0;
        this.isDragging = false;
    }
}
