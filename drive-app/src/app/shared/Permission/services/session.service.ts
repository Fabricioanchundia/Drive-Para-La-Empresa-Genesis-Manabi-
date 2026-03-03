import { Injectable, inject } from '@angular/core';
import { firstValueFrom, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { SessionLog, ActiveSession } from '../../models/model';
import { BaseApiService } from './base-api.service';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly supa = inject(SupabaseService);
  private readonly api  = inject(BaseApiService);

  async getAllSessions(limit = 300): Promise<SessionLog[]> {
    try {
      const { data } = await this.runSupabase(
        this.supa.client
          .from('sessions')
          .select('*')
          .order('login_at', { ascending: false })
          .limit(limit),
        'sessions:list'
      );

      if (!data || data.length === 0) return [];

      return data.map((d: any) => ({
        id:          d.id,
        uid:         d.uid,
        email:       d.email        ?? '',
        displayName: d.display_name ?? '',
        loginAt:     new Date(d.login_at),
        ip:          d.ip           ?? '',
        userAgent:   d.user_agent   ?? '',
        success:     d.success      ?? false
      }));
    } catch (err: any) {
      console.error('[SessionService] getAllSessions error:', err?.message || err);
      return [];
    }
  }

  async logSession(log: Omit<SessionLog, 'id'>): Promise<void> {
    try {
      await this.runSupabase(
        this.supa.client.from('sessions').insert({
          uid:          log.uid,
          email:        log.email,
          display_name: log.displayName,
          login_at:     new Date().toISOString(),
          ip:           log.ip       ?? '',
          user_agent:   log.userAgent ?? '',
          success:      log.success
        }),
        'sessions:insert'
      );
    } catch (err: any) {
      console.error('[SessionService] logSession error:', err?.message || err);
    }
  }

  // ══════════════════════════════════════════════════════════
  // MÉTODOS PARA SESIONES ACTIVAS
  // ══════════════════════════════════════════════════════════

  /**
   * Crear o actualizar sesión activa (upsert por session_id)
   */
  async createOrUpdateActiveSession(session: Omit<ActiveSession, 'id'>): Promise<void> {
    try {
      const now = new Date().toISOString();
      console.log('[SessionService] Creando sesión activa:', {
        session_id: session.session_id,
        user_id: session.user_id,
        email: session.email
      });
      
      const { error } = await this.supa.client.from('active_sessions').upsert({
        session_id:   session.session_id,
        user_id:      session.user_id,
        email:        session.email,
        display_name: session.displayName,
        login_at:     session.login_at.toISOString(),
        last_seen:    now,
        user_agent:   session.user_agent,
        ip_address:   session.ip_address ?? '',
        active:       true
      }, {
        onConflict: 'session_id'
      });

      if (error) {
        console.error('[SessionService] Supabase error:', error);
        throw error;
      }
      
      console.log('[SessionService] Sesión activa creada exitosamente');
    } catch (err: any) {
      console.error('[SessionService] createOrUpdateActiveSession error:', err?.message || err);
      throw err;
    }
  }

  /**
   * Actualizar last_seen de una sesión activa
   */
  async updateLastSeen(sessionId: string): Promise<void> {
    try {
      await this.runSupabase(
        this.supa.client.from('active_sessions')
          .update({ last_seen: new Date().toISOString() })
          .eq('session_id', sessionId),
        'active_sessions:update_last_seen'
      );
    } catch (err: any) {
      console.error('[SessionService] updateLastSeen error:', err?.message || err);
    }
  }

  /**
   * Marcar sesión como inactiva
   */
  async markSessionInactive(sessionId: string): Promise<void> {
    try {
      await this.runSupabase(
        this.supa.client.from('active_sessions')
          .update({ 
            active: false,
            last_seen: new Date().toISOString()
          })
          .eq('session_id', sessionId),
        'active_sessions:mark_inactive'
      );
    } catch (err: any) {
      console.error('[SessionService] markSessionInactive error:', err?.message || err);
      throw err;
    }
  }

  /**
   * Eliminar todas las sesiones activas de un usuario
   * (usado para evitar duplicados antes de crear nueva sesión)
   */
  async deleteActiveSessionsByUserId(userId: string): Promise<void> {
    try {
      const { error } = await this.supa.client
        .from('active_sessions')
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.error('[SessionService] Error eliminando sesiones anteriores:', error);
        throw error;
      }
    } catch (err: any) {
      console.error('[SessionService] deleteActiveSessionsByUserId error:', err?.message || err);
      throw err;
    }
  }

  /**
   * Obtener todas las sesiones activas con filtros opcionales
   */
  async getActiveSessions(params?: {
    activeOnly?: boolean;
    userId?: string;
    limit?: number;
  }): Promise<ActiveSession[]> {
    try {
      const limit = params?.limit ?? 300;
      let query = this.supa.client
        .from('active_sessions')
        .select('*')
        .order('last_seen', { ascending: false })
        .limit(limit);

      if (params?.activeOnly) {
        query = query.eq('active', true);
      }

      if (params?.userId) {
        query = query.eq('user_id', params.userId);
      }

      const { data } = await this.runSupabase(query, 'active_sessions:list');

      if (!data || data.length === 0) return [];

      return data.map((d: any) => ({
        id:          d.id,
        user_id:     d.user_id,
        email:       d.email ?? '',
        displayName: d.display_name ?? '',
        login_at:    new Date(d.login_at),
        last_seen:   new Date(d.last_seen),
        user_agent:  d.user_agent ?? '',
        ip_address:  d.ip_address ?? '',
        active:      d.active ?? false,
        session_id:  d.session_id ?? ''
      }));
    } catch (err: any) {
      console.error('[SessionService] getActiveSessions error:', err?.message || err);
      return [];
    }
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
}