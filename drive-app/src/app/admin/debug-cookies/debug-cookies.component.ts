import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-debug-cookies',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="topbar">
      <div class="topbar-brand">
        <div class="topbar-logo">D</div>
        <span class="topbar-name">DRIVE <span>Debug</span></span>
      </div>
      <div class="topbar-right">
        <a routerLink="/admin" class="btn-topbar">Volver al Panel</a>
      </div>
    </div>

    <div class="container">
      <div class="warning-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div>
          <h3>⚠️ Limitaciones de Seguridad del Navegador</h3>
          <p>Este panel <strong>solo muestra cookies del navegador actual</strong>. Por razones de seguridad (Same-Origin Policy), 
          un admin NO puede leer cookies de otros usuarios desde JavaScript.</p>
          <p>Las cookies marcadas con <code>HttpOnly</code> (más seguras) tampoco aparecen aquí.</p>
          <p>Para auditoría completa de sesiones, usa el <a routerLink="/admin/sessions" class="link">Panel de Sesiones Activas</a>.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Cookies del Navegador Actual</h3>
          <span class="count-badge">{{ cookieCount }} cookies</span>
        </div>

        <div class="cookie-list" *ngIf="cookies.length > 0">
          <div class="cookie-item" *ngFor="let cookie of cookies">
            <div class="cookie-name">{{ cookie.name }}</div>
            <div class="cookie-value">{{ cookie.value }}</div>
          </div>
        </div>

        <div class="empty-state" *ngIf="cookies.length === 0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <p>No hay cookies visibles en este navegador</p>
          <small>Las cookies HttpOnly no aparecen aquí por seguridad</small>
        </div>

        <div class="info-box">
          <h4>¿Por qué no veo todas las cookies?</h4>
          <ul>
            <li><strong>HttpOnly:</strong> Las cookies marcadas como HttpOnly (más seguras) solo son accesibles por el servidor, no por JavaScript.</li>
            <li><strong>Secure:</strong> Cookies Secure solo se envían en conexiones HTTPS.</li>
            <li><strong>SameSite:</strong> Control de cookies en contextos cross-site.</li>
            <li><strong>Dominio:</strong> Solo se ven cookies del dominio actual (<code>{{ currentDomain }}</code>).</li>
          </ul>
        </div>
      </div>
    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');

    /* ── TOPBAR ─────────────────────────────────────────── */
    .topbar { position:sticky; top:0; z-index:100; background:#1a3a6b; border-bottom:1px solid #0d1f3c; padding:0 40px; height:60px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 2px 12px rgba(13,31,60,0.35); font-family:'Poppins',sans-serif; }
    .topbar-brand { display:flex; align-items:center; gap:12px; }
    .topbar-logo { width:36px; height:36px; border-radius:8px; background:#1e4d8c; border:1px solid #2563b0; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:15px; color:white; }
    .topbar-name { font-size:15px; font-weight:700; color:white; }
    .topbar-name span { color:#b8d0ea; }
    .topbar-right { display:flex; align-items:center; gap:10px; }
    .btn-topbar { background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.15); color:white; font-size:12px; font-weight:600; padding:6px 14px; border-radius:8px; cursor:pointer; font-family:'Poppins',sans-serif; transition:background .15s; text-decoration:none; display:inline-flex; align-items:center; gap:6px; }
    .btn-topbar:hover { background:rgba(255,255,255,0.2); }

    /* ── CONTAINER ──────────────────────────────────────── */
    .container { max-width:1000px; margin:0 auto; padding:28px 40px 60px; font-family:'Poppins',sans-serif; }

    /* ── WARNING BANNER ─────────────────────────────────── */
    .warning-banner { display:flex; gap:16px; padding:20px; border-radius:12px; background:#fef3c7; border:2px solid #fbbf24; margin-bottom:24px; }
    .warning-banner svg { flex-shrink:0; color:#92400e; }
    .warning-banner h3 { margin:0 0 8px; font-size:15px; font-weight:700; color:#78350f; }
    .warning-banner p { margin:0 0 6px; font-size:13px; color:#78350f; line-height:1.6; }
    .warning-banner code { background:#fed7aa; padding:2px 6px; border-radius:4px; font-size:12px; }
    .warning-banner .link { color:#1a3a6b; text-decoration:underline; font-weight:600; }

    /* ── CARD ───────────────────────────────────────────── */
    .card { background:#ffffff; border:1px solid #e5e7eb; border-radius:14px; padding:22px; box-shadow:0 1px 3px rgba(13,31,60,0.06),0 4px 12px rgba(13,31,60,0.05); }
    .card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid #e5e7eb; }
    .card-header h3 { font-size:16px; font-weight:700; color:#1a3a6b; margin:0; }
    .count-badge { background:#f0f5fb; color:#1a3a6b; border:1px solid #dce8f5; font-size:12px; font-weight:700; padding:4px 14px; border-radius:20px; }

    /* ── COOKIE LIST ────────────────────────────────────── */
    .cookie-list { display:flex; flex-direction:column; gap:10px; }
    .cookie-item { padding:14px; border-radius:8px; background:#f9fafb; border:1px solid #e5e7eb; }
    .cookie-name { font-size:13px; font-weight:700; color:#1a3a6b; margin-bottom:6px; }
    .cookie-value { font-size:12px; color:#6b7280; font-family:monospace; word-break:break-all; }

    /* ── EMPTY STATE ────────────────────────────────────── */
    .empty-state { text-align:center; padding:40px; color:#9ca3af; }
    .empty-state svg { color:#d1d5db; margin:0 auto 16px; }
    .empty-state p { margin:0 0 8px; font-size:14px; font-weight:600; color:#6b7280; }
    .empty-state small { font-size:12px; color:#9ca3af; }

    /* ── INFO BOX ───────────────────────────────────────── */
    .info-box { margin-top:20px; padding:18px; border-radius:8px; background:#f0f5fb; border:1px solid #dce8f5; }
    .info-box h4 { margin:0 0 12px; font-size:14px; font-weight:700; color:#1a3a6b; }
    .info-box ul { margin:0; padding-left:20px; }
    .info-box li { margin-bottom:8px; font-size:13px; color:#374151; line-height:1.6; }
    .info-box code { background:white; padding:2px 6px; border-radius:4px; font-size:11px; border:1px solid #d1d5db; }
  `]
})
export class DebugCookiesComponent {
  cookies: { name: string; value: string }[] = [];
  currentDomain = window.location.hostname;

  constructor() {
    this.parseCookies();
  }

  private parseCookies(): void {
    const cookieString = document.cookie;
    if (!cookieString) {
      this.cookies = [];
      return;
    }

    this.cookies = cookieString.split(';').map(cookie => {
      const [name, ...valueParts] = cookie.trim().split('=');
      return {
        name: name.trim(),
        value: valueParts.join('=').trim() || '(vacía)'
      };
    });
  }

  get cookieCount(): number {
    return this.cookies.length;
  }
}
