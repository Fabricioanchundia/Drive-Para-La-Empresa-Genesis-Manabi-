import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../../shared/Permission/services/session.service';
import { AuthService } from '../../shared/Permission/services/auth.service';
import { SessionLog, ActiveSession } from '../../shared/models/model';

@Component({
  selector: 'app-session-log',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './session-log.component.html',
  styleUrls: ['./session-log.component.css']
})
export class SessionLogComponent implements OnInit {
  // Logs históricos
  sessions:         SessionLog[] = [];
  filteredSessions: SessionLog[] = [];
  
  // Sesiones activas
  activeSessions:         ActiveSession[] = [];
  filteredActiveSessions: ActiveSession[] = [];
  
  loading    = true;
  search     = '';
  filterType = 'all';
  
  // Toggle entre vistas
  viewMode: 'logs' | 'active' = 'active'; // Por defecto mostrar sesiones activas

  constructor(
    private sessionSvc: SessionService,
    public  authSvc:    AuthService,
    private cdr:        ChangeDetectorRef,
    private router:     Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.loading = true;
    
    try {
      console.log('[SessionLog] Esperando auth...');
      await this.authSvc.authReady;
      console.log('[SessionLog] Auth ready, verificando admin...');

      if (!this.authSvc.isAdmin()) {
        console.warn('[SessionLog] Usuario no es admin, redirigiendo...');
        this.loading = false;
        await this.authSvc.logout();
        return;
      }

      console.log('[SessionLog] Cargando datos...');
      
      // Cargar con timeout para evitar cuelgue infinito
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout cargando sesiones')), 10000)
      );

      await Promise.race([
        Promise.all([
          this.loadHistoricalLogs(),
          this.loadActiveSessions()
        ]),
        timeout
      ]);

      console.log('[SessionLog] Datos cargados exitosamente');

    } catch (err: any) {
      console.error('[SessionLog] Error cargando datos:', err?.message || err);
      // Mostrar mensaje de error al usuario
      alert(`Error al cargar sesiones: ${err?.message || 'Error desconocido'}. Revisa la consola (F12).`);
    } finally {
      console.log('[SessionLog] Finalizando carga...');
      this.loading = false;
      this.cdr.detectChanges(); // 🔧 FORZAR detección de cambios
      console.log('[SessionLog] Loading cambiado a:', this.loading);
    }
  }

  private async loadHistoricalLogs(): Promise<void> {
    console.log('[SessionLog] Cargando logs históricos...');
    this.sessions = await this.sessionSvc.getAllSessions(300);
    console.log('[SessionLog] Logs históricos cargados:', this.sessions.length);
    this.applyFilter();
  }

  private async loadActiveSessions(): Promise<void> {
    console.log('[SessionLog] Cargando sesiones activas...');
    this.activeSessions = await this.sessionSvc.getActiveSessions({ limit: 300 });
    console.log('[SessionLog] Sesiones activas cargadas:', this.activeSessions.length);
    this.applyFilter();
  }

  async refreshActiveSessions(): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();
    try {
      await this.loadActiveSessions();
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  goBack(): void {
    this.router.navigate(['/admin']);
  }

  applyFilter(): void {
    // Filtrar logs históricos
    let logList = [...this.sessions];
    if (this.filterType === 'success') logList = logList.filter(s =>  s.success);
    if (this.filterType === 'failed')  logList = logList.filter(s => !s.success);
    if (this.search.trim()) {
      const q = this.search.toLowerCase();
      logList = logList.filter(s =>
        s.email.toLowerCase().includes(q) ||
        s.displayName.toLowerCase().includes(q)
      );
    }
    this.filteredSessions = logList;

    // Filtrar sesiones activas
    let activeList = [...this.activeSessions];
    if (this.filterType === 'active')   activeList = activeList.filter(s =>  s.active);
    if (this.filterType === 'inactive') activeList = activeList.filter(s => !s.active);
    if (this.search.trim()) {
      const q = this.search.toLowerCase();
      activeList = activeList.filter(s =>
        s.email.toLowerCase().includes(q) ||
        s.displayName.toLowerCase().includes(q)
      );
    }
    this.filteredActiveSessions = activeList;
  }

  setFilter(type: string): void {
    this.filterType = type;
    this.applyFilter();
  }

  formatDevice(ua: string = ''): string {
    if (ua.includes('Mobile') || ua.includes('Android')) return 'Móvil';
    if (ua.includes('Tablet') || ua.includes('iPad'))    return 'Tablet';
    return 'PC';
  }

  formatBrowser(ua: string = ''): string {
    if (ua.includes('Edg'))     return 'Edge';
    if (ua.includes('Chrome'))  return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari'))  return 'Safari';
    if (ua.includes('Opera'))   return 'Opera';
    return 'Otro';
  }

  get totalExitosos(): number { return this.sessions.filter(s =>  s.success).length; }
  get totalFallidos(): number { return this.sessions.filter(s => !s.success).length; }
  get totalActivas():  number { return this.activeSessions.filter(s =>  s.active).length; }
  get totalInactivas(): number { return this.activeSessions.filter(s => !s.active).length; }
  get tasaExito(): string {
    if (!this.sessions.length) return '0%';
    return Math.round((this.totalExitosos / this.sessions.length) * 100) + '%';
  }

  switchView(mode: 'logs' | 'active'): void {
    this.viewMode = mode;
    this.filterType = mode === 'logs' ? 'all' : 'active';
    this.search = '';
    this.applyFilter();
  }

  getTimeSince(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `Hace ${days}d`;
    if (hours > 0) return `Hace ${hours}h`;
    if (minutes > 0) return `Hace ${minutes}m`;
    return 'Ahora';
  }
}