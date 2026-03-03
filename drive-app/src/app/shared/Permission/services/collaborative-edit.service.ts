import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface DocumentChange {
  id: string;
  file_id: string;
  user_id: string;
  user_name: string;
  content_delta: any; // Quill Delta format
  timestamp: string;
  cursor_position: number;
}

export interface ActiveEditor {
  user_id: string;
  user_name: string;
  cursor_position: number;
  color: string;
}

@Injectable({ providedIn: 'root' })
export class CollaborativeEditService {
  private readonly supa = inject(SupabaseService);
  
  private readonly changesSubject = new BehaviorSubject<DocumentChange[]>([]);
  public changes$ = this.changesSubject.asObservable();
  
  private readonly editorsSubject = new BehaviorSubject<ActiveEditor[]>([]);
  public activeEditors$ = this.editorsSubject.asObservable();

  private subscription: any = null;
  private editorPresenceTimer: any = null;

  /**
   * Iniciar sincronización colaborativa de un archivo
   */
  startCollaboration(fileId: string, userId: string, userName: string): void {
    this.stopCollaboration();

    // Suscribirse a cambios en tiempo real usando RealtimeChannel
    const channel = this.supa.client.channel(`file:${fileId}`);
    
    channel.on(
      'postgres_changes' as any,
      {
        event: '*',
        schema: 'public',
        table: 'document_changes',
        filter: `file_id=eq.${fileId}`
      },
      (payload: any) => {
        if (payload.new?.file_id === fileId) {
          const currentChanges = this.changesSubject.value;
          
          if (payload.eventType === 'INSERT') {
            this.changesSubject.next([...currentChanges, payload.new]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = currentChanges.map((c: DocumentChange) => 
              c.id === payload.new.id ? { ...c, ...payload.new } : c
            );
            this.changesSubject.next(updated);
          }
        }
      }
    ).subscribe();

    this.subscription = channel;

    // Actualizar presencia cada 5 segundos
    this.editorPresenceTimer = setInterval(() => {
      this.updatePresence(fileId, userId, userName).catch(err => 
        console.error('[CollaborativeEdit] Error updating presence:', err)
      );
    }, 5000);
  }

  /**
   * Registrar un cambio en el documento
   */
  async saveChange(
    fileId: string,
    userId: string,
    userName: string,
    contentDelta: any,
    cursorPosition: number
  ): Promise<void> {
    const { error } = await this.supa.client
      .from('document_changes')
      .insert({
        file_id: fileId,
        user_id: userId,
        user_name: userName,
        content_delta: contentDelta,
        cursor_position: cursorPosition,
        timestamp: new Date().toISOString()
      });

    if (error) {
      console.error('[CollaborativeEdit] Error saving change:', error);
      throw error;
    }
  }

  /**
   * Obtener todos los cambios de un documento
   */
  async getDocumentChanges(fileId: string): Promise<DocumentChange[]> {
    const { data, error } = await this.supa.client
      .from('document_changes')
      .select('*')
      .eq('file_id', fileId)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('[CollaborativeEdit] Error getting changes:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Actualizar presencia del usuario (cursor, nombre)
   */
  private async updatePresence(
    fileId: string,
    userId: string,
    userName: string
  ): Promise<void> {
    const { error } = await this.supa.client
      .from('editor_presence')
      .upsert({
        file_id: fileId,
        user_id: userId,
        user_name: userName,
        last_seen: new Date().toISOString()
      }, { onConflict: 'file_id,user_id' });

    if (error) {
      console.error('[CollaborativeEdit] Error updating presence:', error);
    }
  }

  /**
   * Obtener editores activos
   */
  async getActiveEditors(fileId: string): Promise<ActiveEditor[]> {
    const { data, error } = await this.supa.client
      .from('editor_presence')
      .select('user_id, user_name, cursor_position')
      .eq('file_id', fileId)
      .gt('last_seen', new Date(Date.now() - 30000).toISOString()); // Últimos 30s

    if (error) {
      console.error('[CollaborativeEdit] Error getting active editors:', error);
      return [];
    }

    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'];
    const editors = (data || []).map((editor, idx) => ({
      ...editor,
      color: colors[idx % colors.length]
    }));

    this.editorsSubject.next(editors);
    return editors;
  }

  /**
   * Aplicar todos los cambios al documento
   */
  async applyAllChanges(fileId: string): Promise<any> {
    const changes = await this.getDocumentChanges(fileId);
    
    // Combinar todos los deltas
    const combined: any = { ops: [] };
    
    for (const change of changes) {
      if (change.content_delta?.ops && Array.isArray(change.content_delta.ops)) {
        combined.ops = [...combined.ops, ...change.content_delta.ops];
      }
    }

    return combined;
  }

  /**
   * Detener colaboración y limpiar suscripciones
   */
  stopCollaboration(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }

    if (this.editorPresenceTimer) {
      clearInterval(this.editorPresenceTimer);
      this.editorPresenceTimer = null;
    }

    this.changesSubject.next([]);
    this.editorsSubject.next([]);
  }
}
