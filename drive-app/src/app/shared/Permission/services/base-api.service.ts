import { Injectable } from '@angular/core';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, finalize, retry, timeout } from 'rxjs/operators';
import { HttpStateService } from './http-state.service';

@Injectable({ providedIn: 'root' })
export class BaseApiService {
  constructor(private readonly httpState: HttpStateService) {}

  request<T>(source$: Observable<T>, key: string): Observable<T> {
    this.httpState.start(key);

    return source$.pipe(
      timeout(8000),
      retry({
        count: 1,
        delay: (err) => (err?.status === 0 ? timer(200) : throwError(() => err))
      }),
      catchError(err => throwError(() => err)),
      finalize(() => this.httpState.stop(key))
    );
  }
}
