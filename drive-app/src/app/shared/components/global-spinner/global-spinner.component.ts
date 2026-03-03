import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpStateService } from '../../Permission/services/http-state.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-global-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="loading$ | async" class="global-spinner-overlay">
      <div class="spinner-container">
        <div class="spinner"></div>
        <p class="loading-text">Cargando...</p>
      </div>
    </div>
  `,
  styles: [`
    .global-spinner-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      animation: fadeIn 0.2s ease-in;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    .spinner-container {
      text-align: center;
    }

    .spinner {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: 4px solid #dce8f5;
      border-top-color: #1a3a6b;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .loading-text {
      margin: 0;
      color: #1a3a6b;
      font-size: 14px;
      font-weight: 500;
      font-family: 'Poppins', sans-serif;
    }
  `]
})
export class GlobalSpinnerComponent {
  loading$: Observable<boolean>;

  constructor(private httpState: HttpStateService) {
    this.loading$ = this.httpState.globalLoadingSmooth$;
  }
}
