import { Injectable, NgZone } from '@angular/core';
import { filter, Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

export enum RealtimeScope {
    AllowedDomains = 'ALLOWED_DOMAINS',
    CurrentSchoolYear = 'CURRENT_SCHOOL_YEAR',
    Users = 'USERS',
    Teachers = 'TEACHERS',
    Subjects = 'SUBJECTS',
    Buildings = 'BUILDINGS',
    Classrooms = 'CLASSROOMS',
    Groups = 'GROUPS',
    Schedules = 'SCHEDULES',
}

export interface RealtimeEvent {
    scopes: RealtimeScope[];
}

@Injectable({ providedIn: 'root' })
export class RealtimeSyncService {
    private readonly eventSubject = new Subject<RealtimeEvent>();
    readonly events$ = this.eventSubject.asObservable();
    private readonly scopeRevisions = new Map<RealtimeScope, number>();

    private socket: WebSocket | null = null;
    private reconnectAttempt = 0;
    private reconnectTimer: number | null = null;
    private readonly subscriptionId = 'realtime-events';
    private readonly query = 'subscription RealtimeEvents { RealtimeEvents { scopes } }';

    constructor(private readonly ngZone: NgZone) {
        if (typeof window !== 'undefined') {
            this.connect();
        }
    }

    watchScopes(scopes: readonly RealtimeScope[]): Observable<RealtimeEvent> {
        return this.events$.pipe(
            filter((event) => event.scopes.some((scope) => scopes.includes(scope)))
        );
    }

    getRevision(scopes: readonly RealtimeScope[]): number {
        if (scopes.length === 0) {
            return 0;
        }

        let revision = 0;

        for (const scope of scopes) {
            revision = Math.max(revision, this.scopeRevisions.get(scope) ?? 0);
        }

        return revision;
    }

    private connect(): void {
        if (typeof window === 'undefined') {
            return;
        }

        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        this.clearReconnectTimer();
        this.socket = new WebSocket(this.buildWebSocketUrl(), ['graphql-transport-ws', 'graphql-ws']);
        this.socket.addEventListener('open', this.handleOpen);
        this.socket.addEventListener('message', this.handleMessage);
        this.socket.addEventListener('close', this.handleClose);
        this.socket.addEventListener('error', this.handleError);
    }

    private readonly handleOpen = (): void => {
        this.reconnectAttempt = 0;
        this.sendJson({ type: 'connection_init' });
    };

    private readonly handleMessage = (event: MessageEvent<string>): void => {
        let message: any;

        try {
            message = JSON.parse(event.data);
        } catch (parseError) {
            console.error('Invalid realtime message:', parseError);
            return;
        }

        switch (message?.type) {
            case 'connection_ack':
                this.sendSubscription();
                break;
            case 'next':
            case 'data':
                this.emitEvent(message?.payload?.data?.RealtimeEvents?.scopes);
                break;
            case 'ping':
                this.sendJson({ type: 'pong', payload: message?.payload });
                break;
            case 'error':
                console.error('Realtime subscription error:', message);
                break;
            default:
                break;
        }
    };

    private readonly handleClose = (): void => {
        this.socket = null;
        this.scheduleReconnect();
    };

    private readonly handleError = (): void => {
        if (this.socket) {
            this.socket.close();
        }
    };

    private sendSubscription(): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }

        const messageType = this.socket.protocol === 'graphql-ws' ? 'start' : 'subscribe';
        this.sendJson({
            id: this.subscriptionId,
            type: messageType,
            payload: { query: this.query },
        });
    }

    private emitEvent(scopes: unknown): void {
        if (!Array.isArray(scopes) || scopes.length === 0) {
            return;
        }

        const normalizedScopes = scopes
            .map((scope) => this.normalizeScope(scope))
            .filter((scope): scope is RealtimeScope => scope !== null);

        if (normalizedScopes.length === 0) {
            return;
        }

        for (const scope of normalizedScopes) {
            this.scopeRevisions.set(scope, (this.scopeRevisions.get(scope) ?? 0) + 1);
        }

        this.ngZone.run(() => {
            this.eventSubject.next({ scopes: normalizedScopes });
        });
    }

    private normalizeScope(scope: unknown): RealtimeScope | null {
        const value = String(scope);

        switch (value) {
            case 'ALLOWED_DOMAINS':
            case 'AllowedDomains':
                return RealtimeScope.AllowedDomains;
            case 'CURRENT_SCHOOL_YEAR':
            case 'CurrentSchoolYear':
                return RealtimeScope.CurrentSchoolYear;
            case 'USERS':
            case 'Users':
                return RealtimeScope.Users;
            case 'TEACHERS':
            case 'Teachers':
                return RealtimeScope.Teachers;
            case 'SUBJECTS':
            case 'Subjects':
                return RealtimeScope.Subjects;
            case 'BUILDINGS':
            case 'Buildings':
                return RealtimeScope.Buildings;
            case 'CLASSROOMS':
            case 'Classrooms':
                return RealtimeScope.Classrooms;
            case 'GROUPS':
            case 'Groups':
                return RealtimeScope.Groups;
            case 'SCHEDULES':
            case 'Schedules':
                return RealtimeScope.Schedules;
            default:
                return null;
        }
    }

    private sendJson(message: Record<string, unknown>): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }

        this.socket.send(JSON.stringify(message));
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer !== null || typeof window === 'undefined') {
            return;
        }

        const delay = Math.min(1000 * 2 ** Math.min(this.reconnectAttempt, 4), 10000);
        this.reconnectAttempt += 1;
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer !== null) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private buildWebSocketUrl(): string {
        const baseUrl = environment.apiUrl || window.location.origin;
        const url = new URL('/graphql/ws', baseUrl);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return url.toString();
    }
}
