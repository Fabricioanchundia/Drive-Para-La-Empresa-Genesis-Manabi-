import { Injectable, inject, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { User } from '../../models/model';
import { BaseApiService } from './base-api.service';
import { SessionService } from './session.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supa       = inject(SupabaseService);
  private readonly router     = inject(Router);
  private readonly zone       = inject(NgZone);
  private readonly api        = inject(BaseApiService);
  private readonly sessionSvc = inject(SessionService);

  private readonly currentUserSubject = new BehaviorSubject<User | null>(null);
  currentUser$ = this.currentUserSubject.asObservable();

  private readonly authReadySubject = new BehaviorSubject<boolean>(false);
  authReady$ = this.authReadySubject.asObservable();
  private authReadyResolved = false;

  private readonly initialSessionSubject = new BehaviorSubject<boolean>(false);
  initialSession$ = this.initialSessionSubject.asObservable();

  private resolveReady!: () => void;
  readonly authReady: Promise<void> = new Promise<void>(r => this.resolveReady = r);

  // ══════════════════════════════════════════════════════════
  // GESTIÓN DE SESIÓN ACTIVA EN TIEMPO REAL
  // ══════════════════════════════════════════════════════════
  private currentSessionId: string | null = null;
  private heartbeatInterval?: ReturnType<typeof setInterval>;
  private readonly HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 segundos

  constructor() {
    this.initAuthFlow();
  }

  private initAuthFlow(): void {
    // Timeout duro: 4 segundos máximo
    const hardTimeout = setTimeout(() => this.markAuthReady(), 4000);

    this.runSupabase(this.supa.client.auth.getSession(), 'auth:getSession')
      .then(async ({ data }) => {
        const hasSession = !!data.session?.user;
        this.zone.run(() => this.initialSessionSubject.next(hasSession));
        if (data.session?.user) {
          await this.loadUser(data.session.user.id);
        }
      })
      .catch(() => {})
      .finally(() => this.markAuthReady());

    this.supa.client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        clearTimeout(hardTimeout);
        this.zone.run(() => this.initialSessionSubject.next(!!session?.user));
        if (session?.user) {
          await this.loadUser(session.user.id);
        }
        this.markAuthReady();
        return;
      }

      if (event === 'SIGNED_IN' && session?.user) {
        this.zone.run(async () => await this.loadUser(session.user.id));
      }

      if (event === 'SIGNED_OUT') {
        this.zone.run(() => {
          this.currentUserSubject.next(null);
          this.initialSessionSubject.next(false);
        });
      }

      if (event === 'TOKEN_REFRESHED' && session?.user) {
        this.zone.run(async () => await this.loadUser(session.user.id));
      }
    });
  }

  private markAuthReady(): void {
    if (this.authReadyResolved) return;
    this.authReadyResolved = true;
    this.resolveReady();
    this.zone.run(() => this.authReadySubject.next(true));
  }

  private async loadUser(uid: string): Promise<void> {
    const user = await this.getUserData(uid);
    this.zone.run(() => this.currentUserSubject.next(user));
  }

  async login(email: string, password: string): Promise<void> {
    let data: any;
    try {
      ({ data } = await this.runSupabase(
        this.supa.client.auth.signInWithPassword({ email, password }),
        'auth:login'
      ));
    } catch (err: any) {
      throw this.buildAuthError(this.mapError(err?.message || ''));
    }

    const user = await this.getUserData(data.user.id);
    
    if (user && !user.active) {
      await this.runSupabase(this.supa.client.auth.signOut(), 'auth:signOut');
      throw this.buildAuthError('auth/user-disabled');
    }

    // ═════════════════════════════════════════════════════════
    // REGISTRAR SESIÓN ACTIVA DESPUÉS DE LOGIN EXITOSO
    // ═════════════════════════════════════════════════════════
    if (user) {
      // 1. Obtener sesión actual de Supabase
      const { data: sessionData, error: sessionError } = await this.supa.client.auth.getSession();
      
      if (sessionError) {
        console.error('Error obteniendo sesión:', sessionError);
      }
      
      if (sessionData?.session?.access_token) {
        const sessionId = sessionData.session.access_token;
        this.currentSessionId = sessionId;
        
        // 2. Eliminar sesiones anteriores del mismo usuario
        try {
          const { error: deleteError } = await this.supa.client
            .from('active_sessions')
            .delete()
            .eq('user_id', user.uid);
            
          if (deleteError) {
            console.error('Error eliminando sesiones anteriores:', deleteError);
          }
        } catch (err) {
          console.error('Error en delete sesiones:', err);
        }
        
        // 3. Insertar nueva sesión activa
        const { error: insertError } = await this.supa.client
          .from('active_sessions')
          .insert({
            session_id: sessionId,
            user_id: user.uid,
            email: user.email,
            display_name: user.displayName,
            login_at: new Date().toISOString(),
            last_seen: new Date().toISOString(),
            user_agent: navigator.userAgent,
            active: true
          });
        
        if (insertError) {
          console.error('Insert error:', insertError);
        } else {
          // 4. Iniciar heartbeat de actualización de last_seen
          this.startSessionHeartbeat(sessionId);
        }
      } else {
        console.warn('No se pudo obtener access_token de la sesión');
      }
    }

    this.zone.run(() => this.currentUserSubject.next(user));
    const dest = user?.role === 'admin' ? '/admin' : '/dashboard';
    this.router.navigate([dest]);
  }

  async register(email: string, password: string, displayName: string): Promise<void> {
    let data: any;
    try {
      ({ data } = await this.runSupabase(
        this.supa.client.auth.signUp({ email, password }),
        'auth:register'
      ));
    } catch (err: any) {
      throw this.buildAuthError(this.mapError(err?.message || ''));
    }

    const userData: User = {
      uid: data.user!.id, email, displayName,
      role: 'user', active: true, createdAt: new Date()
    };

    await this.runSupabase(this.supa.client.from('users').insert({
      id: userData.uid, email: userData.email,
      display_name: userData.displayName,
      role: userData.role, active: userData.active,
      created_at: new Date().toISOString()
    }), 'users:insert');

    this.zone.run(() => this.currentUserSubject.next(userData));
    this.router.navigate(['/dashboard']);
  }

  async logout(): Promise<void> {
    // Cerrar sesión activa antes de signOut
    if (this.currentSessionId) {
      await this.closeActiveSession(this.currentSessionId);
    }

    this.currentUserSubject.next(null);
    await this.runSupabase(this.supa.client.auth.signOut(), 'auth:signOut');
    this.router.navigate(['/login']);
  }

  async getUserData(uid: string): Promise<User | null> {
    try {
      const { data } = await this.runSupabase(
        this.supa.client.from('users').select('*').eq('id', uid).single(),
        'users:get'
      );
      return {
        uid:         data.id,
        email:       data.email,
        displayName: (data.display_name && data.display_name !== data.email)
                      ? data.display_name
                      : data.email.split('@')[0],
        role:        data.role,
        active:      data.active,
        createdAt:   new Date(data.created_at)
      };
    } catch { return null; }
  }

  async refreshCurrentUserFromSession(): Promise<User | null> {
    const { data } = await this.runSupabase(this.supa.client.auth.getSession(), 'auth:getSession');
    const sessionUser = data.session?.user;
    if (!sessionUser) {
      this.zone.run(() => this.currentUserSubject.next(null));
      return null;
    }

    const user = await this.getUserData(sessionUser.id);
    this.zone.run(() => this.currentUserSubject.next(user));
    return user;
  }

  async getSessionUserId(): Promise<string> {
    const { data } = await this.runSupabase(this.supa.client.auth.getSession(), 'auth:getSession');
    return data.session?.user?.id || '';
  }

  private async runSupabase<T>(promise: PromiseLike<T>, key: string): Promise<T> {
    return firstValueFrom(
      this.api.request(
        from(promise).pipe(
          map((res: any) => {
            if (res?.error) throw res.error;
            return res as T;
          })
        ),
        key
      )
    );
  }

  private mapError(msg: string): string {
    if (msg.includes('Invalid login'))           return 'auth/invalid-credential';
    if (msg.includes('Email not confirmed'))     return 'auth/email-not-confirmed';
    if (msg.includes('User already registered')) return 'auth/email-already-in-use';
    return 'auth/unknown';
  }

  private buildAuthError(code: string): Error & { code: string } {
    const err = new Error(code) as Error & { code: string };
    err.code = code;
    return err;
  }

  // ══════════════════════════════════════════════════════════
  // MÉTODOS DE GESTIÓN DE SESIÓN ACTIVA
  // ══════════════════════════════════════════════════════════

  /**
   * Iniciar heartbeat para actualizar last_seen cada 30 segundos
   * Solo actualiza si la sesión está activa
   */
  private startSessionHeartbeat(sessionId: string): void {
    this.stopSessionHeartbeat();
    
    this.heartbeatInterval = setInterval(async () => {
      if (this.currentSessionId && this.isLoggedIn()) {
        try {
          await this.sessionSvc.updateLastSeen(this.currentSessionId);
          console.log('[Auth] Last seen actualizado:', new Date().toISOString());
        } catch (err: any) {
          console.error('[Auth] Error actualizando last_seen:', err?.message || err);
        }
      }
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Detener heartbeat de actualización de last_seen
   */
  private stopSessionHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  /**
   * Cerrar sesión activa: marcar como inactiva y detener heartbeat
   * Se ejecuta antes de signOut()
   */
  private async closeActiveSession(sessionId: string): Promise<void> {
    try {
      // Detener heartbeat primero
      this.stopSessionHeartbeat();
      
      // Marcar sesión como inactiva en BD
      await this.sessionSvc.markSessionInactive(sessionId);
      
      // Limpiar ID de sesión actual
      this.currentSessionId = null;
      
      console.log('[Auth] Sesión activa cerrada exitosamente');
    } catch (err: any) {
      console.error('[Auth] Error cerrando sesión activa:', err?.message || err);
      // Continuar con logout aunque falle el cierre de sesión
    }
  }

  get currentUser(): User | null { return this.currentUserSubject.value; }
  isLoggedIn(): boolean          { return !!this.currentUserSubject.value; }
  isAdmin():    boolean          { return this.currentUserSubject.value?.role === 'admin'; }
}