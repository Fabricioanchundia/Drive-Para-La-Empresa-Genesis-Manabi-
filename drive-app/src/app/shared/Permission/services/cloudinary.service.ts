import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class CloudinaryService {
  private readonly BUCKET = 'drive-files';
  private readonly supa   = inject(SupabaseService);
  private readonly auth   = inject(AuthService);

  async uploadFile(file: File, onProgress?: (pct: number) => void): Promise<{ url: string; publicId: string }> {
    const uid = this.auth.currentUser?.uid || 'anonymous';
    const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
    const uniqueName = `${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}${ext ? '.' + ext : ''}`;

    // Supabase Storage no soporta progreso nativo, simulamos el inicio
    if (onProgress) onProgress(10);

    const { data, error } = await this.supa.client.storage
      .from(this.BUCKET)
      .upload(uniqueName, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      });

    if (error) throw new Error(error.message);

    if (onProgress) onProgress(100);

    const { data: { publicUrl } } = this.supa.client.storage
      .from(this.BUCKET)
      .getPublicUrl(data.path);

    return { url: publicUrl, publicId: data.path };
  }
}