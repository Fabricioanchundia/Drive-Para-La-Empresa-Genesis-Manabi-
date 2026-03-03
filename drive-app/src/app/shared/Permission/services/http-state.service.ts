import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, timer, of } from 'rxjs';
import { distinctUntilChanged, map, switchMap, debounceTime } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class HttpStateService {
  private readonly stateSubject = new BehaviorSubject<Record<string, number>>({});

  start(key: string): void {
    const state = { ...this.stateSubject.value };
    state[key] = (state[key] || 0) + 1;
    this.stateSubject.next(state);
  }

  stop(key: string): void {
    const state = { ...this.stateSubject.value };
    if (!state[key]) return;
    state[key] = state[key] - 1;
    if (state[key] <= 0) delete state[key];
    this.stateSubject.next(state);
  }

  isLoading$(key: string): Observable<boolean> {
    return this.stateSubject.asObservable().pipe(
      map(state => (state[key] || 0) > 0),
      distinctUntilChanged()
    );
  }

  get globalLoading$(): Observable<boolean> {
    return this.stateSubject.asObservable().pipe(
      map(state => Object.values(state).some(v => v > 0)),
      distinctUntilChanged()
    );
  }

  /**
   * Observable de carga global con comportamiento mejorado para UX:
   * - No muestra el spinner si la carga termina en menos de 250ms
   * - Si se muestra, permanece visible mínimo 200ms para evitar flicker
   */
  get globalLoadingSmooth$(): Observable<boolean> {
    let loadingStartTime: number | null = null;
    const DELAY_BEFORE_SHOW = 250; // ms antes de mostrar spinner
    const MIN_VISIBLE_TIME = 200; // ms mínimo visible

    return this.globalLoading$.pipe(
      switchMap(isLoading => {
        if (isLoading) {
          // Carga iniciada: esperar 250ms antes de mostrar
          if (loadingStartTime === null) {
            loadingStartTime = Date.now();
          }
          return timer(DELAY_BEFORE_SHOW).pipe(
            map(() => {
              // Verificar si aún está cargando después del delay
              const stillLoading = Object.values(this.stateSubject.value).some(v => v > 0);
              return stillLoading;
            })
          );
        } else {
          // Carga finalizada
          if (loadingStartTime === null) {
            // Nunca se mostró el spinner
            return of(false);
          }
          const elapsed = Date.now() - loadingStartTime;
          loadingStartTime = null;

          if (elapsed < DELAY_BEFORE_SHOW) {
            // Terminó antes de mostrar el spinner
            return of(false);
          }
          // Mantener visible el tiempo mínimo
          const remainingTime = MIN_VISIBLE_TIME - (elapsed - DELAY_BEFORE_SHOW);
          if (remainingTime > 0) {
            return timer(remainingTime).pipe(map(() => false));
          }
          return of(false);
        }
      }),
      distinctUntilChanged()
    );
  }
}
