import { Injectable } from '@angular/core';
import { defer, finalize, Observable, of, shareReplay, tap } from 'rxjs';

import { RealtimeScope, RealtimeSyncService } from './realtime-sync.service';

interface CacheEntry<T> {
    revision: number;
    value: T;
}

@Injectable({ providedIn: 'root' })
export class RealtimeQueryCacheService {
    private readonly cache = new Map<string, CacheEntry<unknown>>();
    private readonly inflight = new Map<string, Observable<unknown>>();

    constructor(private readonly realtimeSync: RealtimeSyncService) {}

    load<T>(key: string, scopes: readonly RealtimeScope[], loader: () => Observable<T>): Observable<T> {
        const revision = this.realtimeSync.getRevision(scopes);
        const cached = this.cache.get(key) as CacheEntry<T> | undefined;
        const inflight = this.inflight.get(key) as Observable<T> | undefined;

        if (cached && cached.revision === revision) {
            return of(cached.value);
        }

        if (inflight) {
            return inflight;
        }

        const request$ = defer(loader).pipe(
            tap((value) => {
                this.cache.set(key, { revision, value });
            }),
            finalize(() => {
                this.inflight.delete(key);
            }),
            shareReplay({ bufferSize: 1, refCount: false })
        );

        this.inflight.set(key, request$);

        return request$;
    }

    refresh<T>(key: string, scopes: readonly RealtimeScope[], loader: () => Observable<T>): Observable<T> {
        this.inflight.delete(key);

        const request$ = defer(loader).pipe(
            tap((value) => {
                this.cache.set(key, {
                    revision: this.realtimeSync.getRevision(scopes),
                    value,
                });
            }),
            finalize(() => {
                this.inflight.delete(key);
            }),
            shareReplay({ bufferSize: 1, refCount: false })
        );

        this.inflight.set(key, request$);

        return request$;
    }

    clear(): void {
        this.cache.clear();
        this.inflight.clear();
    }
}