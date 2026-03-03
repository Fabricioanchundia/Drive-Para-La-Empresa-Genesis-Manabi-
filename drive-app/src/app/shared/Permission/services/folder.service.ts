import { Injectable, inject } from '@angular/core';
import { firstValueFrom, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Folder } from '../../models/model';
import { BaseApiService } from './base-api.service';

@Injectable({ providedIn: 'root' })
export class FolderService {
  private readonly supa    = inject(SupabaseService);
  private readonly authSvc = inject(AuthService);
  private readonly api     = inject(BaseApiService);

  private get uid(): string {
    return this.authSvc.currentUser?.uid || '';
  }

  async createFolder(name: string, parentId: string | null = null): Promise<Folder> {
    const uid = this.uid;
    const { data } = await this.runSupabase(this.supa.client.from('folders').insert({
      name,
      parent_id:  parentId,
      owner_id:   uid,
      created_at: new Date().toISOString()
    }).select().single(), 'folders:insert');
    return this.mapFolder(data);
  }

  async getFolders(parentId: string | null = null): Promise<Folder[]> {
    const uid = this.uid;
    if (!uid) return [];

    let query = this.supa.client
      .from('folders')
      .select('*')
      .eq('owner_id', uid)
      .order('created_at', { ascending: true });

    // Supabase: .is() para null, .eq() para valor
    if (parentId === null) {
      query = query.is('parent_id', null) as any;
    } else {
      query = query.eq('parent_id', parentId) as any;
    }

    try {
      const { data } = await this.runSupabase(query, 'folders:list');
      return (data || []).map((r: any) => this.mapFolder(r));
    } catch (err: any) {
      console.error('[FolderService]', err?.message || err);
      return [];
    }
  }

  async renameFolder(folderId: string, newName: string): Promise<void> {
    const uid = this.uid;
    if (!uid) throw new Error('No autenticado');
    await this.runSupabase(
      this.supa.client
        .from('folders')
        .update({ name: newName })
        .eq('id', folderId)
        .eq('owner_id', uid),
      'folders:rename'
    );
  }

  async deleteFolder(folderId: string): Promise<void> {
    await this.runSupabase(
      this.supa.client.from('folders').delete().eq('id', folderId),
      'folders:delete'
    );
  }

  /** Obtiene carpetas compartidas con el usuario actual (usa backend para bypasear RLS) */
  async getSharedFolders(): Promise<Folder[]> {
    const uid = this.uid;
    if (!uid) return [];
    try {
      // Obtener JWT de la sesión activa
      const { data: sessionData } = await this.supa.client.auth.getSession();
      const jwt = sessionData?.session?.access_token;
      if (!jwt) return [];

      // El proxy /folder-api → http://localhost:3001 (supaAdmin bypasea RLS)
      const response = await fetch('/folder-api/shared-folders', {
        headers: { Authorization: `Bearer ${jwt}` }
      });

      if (!response.ok) {
        console.error('[FolderService] getSharedFolders server error:', response.status);
        return [];
      }

      const body = await response.json();
      const folders: any[] = body.folders || [];

      return folders.map((f: any) => {
        const mapped = this.mapFolder(f);
        mapped.isShared = true;
        mapped.sharedPermission = f.sharedPermission ?? 'viewer';
        return mapped;
      });
    } catch (err: any) {
      console.error('[FolderService] getSharedFolders error:', err?.message);
      return [];
    }
  }

  /** Obtiene una carpeta por ID (con fallback al backend para carpetas compartidas) */
  async getFolderById(folderId: string): Promise<Folder | null> {
    // Intento 1: consulta directa (funciona para carpetas propias y públicas)
    const { data, error } = await this.supa.client
      .from('folders')
      .select('id,name,parent_id,owner_id,created_at')
      .eq('id', folderId)
      .maybeSingle();

    if (!error && data) return this.mapFolder(data);

    // Intento 2: backend con JWT (bypasea RLS para carpetas compartidas por email)
    try {
      const { data: sessionData } = await this.supa.client.auth.getSession();
      const jwt = sessionData?.session?.access_token;
      if (!jwt) return null;

      const res = await fetch(`/folder-api/folder-by-id/${encodeURIComponent(folderId)}`, {
        headers: { Authorization: `Bearer ${jwt}` }
      });
      if (!res.ok) return null;

      const body = await res.json();
      return body.folder ? this.mapFolder(body.folder) : null;
    } catch {
      return null;
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

  async getBreadcrumb(folderId: string | null): Promise<Folder[]> {
    if (!folderId) return [];
    const breadcrumb: Folder[] = [];
    let current: string | null = folderId;
    let limit = 10;

    while (current && limit > 0) {
      limit--;
      const { data, error } = await this.supa.client
        .from('folders').select('*').eq('id', current).single();
      if (error || !data) break;
      const folder = this.mapFolder(data);
      breadcrumb.unshift(folder);
      current = folder.parentId ?? null;
    }
    return breadcrumb;
  }

  /**
   * Obtiene una carpeta por su public_id (para vista pública)
   */
  async getFolderByPublicId(
    token: string
  ): Promise<{ id: string; name: string; owner_id: string } | null> {
    const { data, error } = await this.supa.client
      .from('folders')
      .select('id, name, owner_id')
      .eq('public_id', token)
      .eq('public_link_active', true)
      .maybeSingle();

    if (error) {
      console.error('[FolderService] getFolderByPublicId error:', error);
      return null;
    }

    return data;
  }

  /**
   * Obtiene carpeta publica y sus archivos usando un token publico.
   * Usa el servidor backend (/folder-api) para evitar bloqueos de RLS.
   */
  async getPublicFolder(token: string): Promise<{
    folder: { id: string; name: string; owner_id: string };
    files: Array<{ id: string; name: string; size: number; type: string; url: string }>;
  } | null> {
    try {
      const response = await fetch(`/folder-api/public-folder/${encodeURIComponent(token)}`);
      if (!response.ok) return null;
      const data = await response.json();
      if (!data || !data.folder) return null;
      return { folder: data.folder, files: data.files || [] };
    } catch (err) {
      console.error('[FolderService] getPublicFolder via server error:', err);
      return null;
    }
  }

  /**
   * Genera URL de descarga ZIP de carpeta pública
   */
  getPublicFolderZipUrl(token: string): string {
    return `/folder-api/public-folder/${encodeURIComponent(token)}/zip`;
  }

  private mapFolder(r: any): Folder {
    return {
      id:                r.id,
      name:              r.name,
      parentId:          r.parent_id,
      ownerId:           r.owner_id,
      sharedWith:        [],
      createdAt:         new Date(r.created_at)
    };
  }
}