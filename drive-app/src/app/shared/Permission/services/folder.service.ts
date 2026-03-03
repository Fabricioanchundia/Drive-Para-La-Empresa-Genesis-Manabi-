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

  async deleteFolder(folderId: string): Promise<void> {
    await this.runSupabase(
      this.supa.client.from('folders').delete().eq('id', folderId),
      'folders:delete'
    );
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
   * Obtiene archivos de una carpeta pública (sin autenticación)
   */
  async getPublicFolderFiles(
    folderId: string
  ): Promise<Array<{ id: string; name: string; size: number; type: string; url: string }>> {
    const { data, error } = await this.supa.client
      .from('files')
      .select('id, name, size, type, url')
      .eq('folder_id', folderId);

    if (error) {
      console.error('[FolderService] getPublicFolderFiles error:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtiene carpeta publica y sus archivos usando un token publico
   */
  async getPublicFolder(token: string): Promise<{
    folder: { id: string; name: string; owner_id: string };
    files: Array<{ id: string; name: string; size: number; type: string; url: string }>;
  } | null> {
    const folder = await this.getFolderByPublicId(token);
    if (!folder) return null;

    const files = await this.getPublicFolderFiles(folder.id);
    return { folder, files };
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