import { Injectable, inject } from '@angular/core';
import { firstValueFrom, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { CloudinaryService } from './cloudinary.service';
import { DriveFile } from '../../models/model';
import { BaseApiService } from './base-api.service';

@Injectable({ providedIn: 'root' })
export class FileService {
  private readonly supa      = inject(SupabaseService);
  private readonly authSvc   = inject(AuthService);
  private readonly cloudinary = inject(CloudinaryService);
  private readonly api       = inject(BaseApiService);

  private get uid(): string {
    return this.authSvc.currentUser?.uid || '';
  }

  async uploadFile(
    file: File,
    folderId: string | null = null,
    onProgress?: (pct: number) => void
  ): Promise<DriveFile> {
    const uid = this.uid;
    if (!uid) throw new Error('No autenticado');

    // Subir a Cloudinary
    const { url, publicId } = await this.cloudinary.uploadFile(file, onProgress);

    const { data } = await this.runSupabase(this.supa.client.from('files').insert({
      name:               file.name,
      type:               file.type || 'application/octet-stream',
      size:               file.size,
      url,
      public_id:          publicId,
      folder_id:          folderId,
      owner_id:           uid,
      public_link_active: false,
      shared_with:        [],
      created_at:         new Date().toISOString(),
      updated_at:         new Date().toISOString()
    }).select().single(), 'files:insert');
    return this.mapFile(data);
  }

  async getFiles(folderId: string | null = null): Promise<DriveFile[]> {
    const uid = this.uid;
    if (!uid) return [];

    let query = this.supa.client
      .from('files')
      .select('*')
      .eq('owner_id', uid)
      .order('created_at', { ascending: false });

    if (folderId === null) {
      query = query.is('folder_id', null) as any;
    } else {
      query = query.eq('folder_id', folderId) as any;
    }

    try {
      const { data } = await this.runSupabase(query, 'files:list');
      return (data || []).map((r: any) => this.mapFile(r));
    } catch (err: any) {
      console.error('[FileService]', err?.message || err);
      return [];
    }
  }

  async getFileByPublicId(
    token: string
  ): Promise<{ id: string; name: string; size: number; type: string; url: string } | null> {
    console.log('[FileService] getFileByPublicId con token:', token);
    
    const { data, error } = await this.supa.client
      .from('files')
      .select('id, name, size, type, url, public_id, public_link_active')
      .eq('public_id', token)
      .eq('public_link_active', true)
      .maybeSingle();

    if (error) {
      console.error('[FileService] getFileByPublicId error:', error);
      return null;
    }

    if (!data) {
      console.warn('[FileService] Token no encontrado o link inactivo:', token);
      return null;
    }

    console.log('[FileService] Archivo encontrado:', data.name);

    // Asegurar que la URL de Cloudinary sea pública
    if (data?.url) {
      const publicUrl = this.ensurePublicCloudinaryUrl(data.url);
      return {
        id: data.id,
        name: data.name,
        size: data.size,
        type: data.type,
        url: publicUrl
      };
    }

    return data;
  }

  async renameFile(fileId: string, newName: string): Promise<void> {
    const uid = this.uid;
    if (!uid) throw new Error('No autenticado');
    await this.runSupabase(
      this.supa.client
        .from('files')
        .update({ name: newName, updated_at: new Date().toISOString() })
        .eq('id', fileId)
        .eq('owner_id', uid),
      'files:rename'
    );
  }

  async getFileById(fileId: string): Promise<DriveFile | null> {
    const uid = this.uid;
    
    // Primero intentar obtener el archivo
    const { data: fileData, error: fileError } = await this.supa.client
      .from('files')
      .select('*')
      .eq('id', fileId)
      .maybeSingle();

    if (fileError || !fileData) {
      console.error('[FileService] getFileById error:', fileError);
      return null;
    }

    // Verificar acceso: propietario O con permiso compartido
    if (fileData.owner_id === uid) {
      // Es propietario
      return this.mapFile(fileData);
    }

    // Verificar si está compartido
    const { data: permData } = await this.supa.client
      .from('permissions')
      .select('permission')
      .eq('resource_type', 'file')
      .eq('resource_id', fileId)
      .eq('user_id', uid)
      .maybeSingle();

    if (permData) {
      // Tiene permiso compartido
      const mapped = this.mapFile(fileData);
      if (permData.permission === 'viewer' || permData.permission === 'view') {
        mapped.isShared = true;
        mapped.sharedPermission = 'viewer';
      } else if (permData.permission === 'editor' || permData.permission === 'edit') {
        mapped.isShared = true;
        mapped.sharedPermission = 'editor';
      }
      return mapped;
    }

    // Sin acceso
    return null;
  }

  async getSharedFiles(): Promise<DriveFile[]> {
    const uid = this.uid;
    if (!uid) return [];

    try {
      // Obtener permisos donde el usuario tiene acceso
      const { data: perms } = await this.supa.client
        .from('permissions')
        .select('resource_id, permission')
        .eq('resource_type', 'file')
        .eq('user_id', uid);

      if (!perms || perms.length === 0) return [];

      const fileIds = perms.map((p: any) => p.resource_id);

      // Obtener archivos correspondientes
      const { data: files } = await this.supa.client
        .from('files')
        .select('*')
        .in('id', fileIds)
        .order('created_at', { ascending: false });

      if (!files) return [];

      // Mapear archivos y agregar info de permiso
      return files.map((f: any) => {
        const perm = perms.find((p: any) => p.resource_id === f.id);
        const mapped = this.mapFile(f);
        mapped.isShared = true;

        let normalizedPermission: 'viewer' | 'editor' = 'viewer';
        if (perm?.permission === 'editor' || perm?.permission === 'edit') {
          normalizedPermission = 'editor';
        }

        mapped.sharedPermission = normalizedPermission;
        return mapped;
      });
    } catch (err: any) {
      console.error('[FileService] getSharedFiles error:', err?.message);
      return [];
    }
  }

  /**
   * Asegura que la URL de Cloudinary sea pública sin validación de credenciales
   */
  private ensurePublicCloudinaryUrl(url: string): string {
    // Si ya es HTTPS, está bien
    if (url.includes('https://')) {
      return url;
    }
    // Convertir de http a https si es necesario
    return url.replace('http://', 'https://');
  }

  async deleteFile(file: DriveFile): Promise<void> {
    await this.runSupabase(
      this.supa.client.from('files').delete().eq('id', file.id!),
      'files:delete'
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

  private mapFile(r: any): DriveFile {
    return {
      id:               r.id,
      name:             r.name,
      type:             r.type,
      size:             r.size,
      url:              r.url,
      publicId:         r.public_id,
      storagePath:      r.public_id || '',
      folderId:         r.folder_id,
      ownerId:          r.owner_id,
      sharedWith:       r.shared_with || [],
      publicLinkActive: r.public_link_active,
      publicLink:       r.public_link,
      createdAt:        new Date(r.created_at),
      updatedAt:        new Date(r.updated_at)
    };
  }

  formatSize(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024)          return `${bytes} B`;
    if (bytes < 1048576)       return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1073741824)    return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(1)} GB`;
  }

  getFileIcon(type: string): string {
    if (!type) return 'FILE';
    const t = type.toLowerCase();
    if (t.includes('image'))                                          return 'IMG';
    if (t.includes('pdf'))                                            return 'PDF';
    if (t.includes('video'))                                          return 'VID';
    if (t.includes('audio'))                                          return 'AUD';
    if (t.includes('zip') || t.includes('rar') || t.includes('7z'))  return 'ZIP';
    if (t.includes('sheet') || t.includes('excel') || t.includes('csv')) return 'XLS';
    if (t.includes('presentation') || t.includes('powerpoint'))      return 'PPT';
    if (t.includes('word') || t.includes('document'))                return 'DOC';
    if (t.includes('text') || t.includes('plain'))                   return 'TXT';
    return 'FILE';
  }
}