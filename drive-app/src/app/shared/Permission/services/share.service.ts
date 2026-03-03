import { Injectable, inject } from '@angular/core';
import { ShareLink, SharedPermission, DriveFile } from '../../models/model';
import { SupabaseService } from './supabase.service';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ShareService {
  private readonly supa    = inject(SupabaseService);

  getPublicAppBaseUrl(): string {
    const configured = (environment.frontendUrl || '').trim().replace(/\/$/, '');
    if (configured) return configured;

    const origin = globalThis.location?.origin || 'http://localhost:4200';
    return origin.replace(/\/$/, '');
  }

  // ══════════════════════════════════════════════════════════
  // FUNCIONES DE SEGURIDAD
  // ══════════════════════════════════════════════════════════

  /**
   * Genera una contraseña aleatoria de 6 caracteres (opcional)
   */
  private generateRandomPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < 6; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Calcula un hash simple de la contraseña (no es bcrypt, pero suficiente para este caso)
   * En producción, usar bcrypt en el backend
   */
  private async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Verifica una contraseña contra su hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    const computedHash = await this.hashPassword(password);
    return computedHash === hash;
  }

  // ══════════════════════════════════════════════════════════
  // COMPARTIR ARCHIVOS CON LINK PÚBLICO (Token corto)
  // ══════════════════════════════════════════════════════════

  /**
   * Genera un token corto aleatorio de 8 caracteres
   * Usa Base62 (números + letras mayúsculas + minúsculas) para URLs amigables
   */
  private generateShortToken(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';
    const array = new Uint8Array(8);
    globalThis.crypto.getRandomValues(array);
    
    for (let i = 0; i < 8; i++) {
      token += chars[array[i] % chars.length];
    }
    
    return token;
  }

  /**
   * Genera un link público seguro para un archivo usando token corto
   * Opciones de seguridad disponibles
   */
  async generatePublicLinkFile(
    fileId: string, 
    options?: { 
      withPassword?: boolean; 
      expiresInDays?: number;
    }
  ): Promise<{ link: string; password?: string }> {
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      const token = this.generateShortToken();
      
      // Verificar si el token ya existe
      const { data: existing } = await this.supa.client
        .from('files')
        .select('id')
        .eq('public_id', token)
        .maybeSingle();
      
      if (!existing) {
        // Token único encontrado, preparar actualización
        const updateData: any = {
          public_id: token,
          public_link_active: true
        };

        // Agregar contraseña si se solicita (solo si los campos existen en BD)
        if (options?.withPassword) {
          const password = this.generateRandomPassword();
          const passwordHash = await this.hashPassword(password);
          updateData.password_hash = passwordHash;
          updateData.has_password = true;
        }

        // Agregar expiración si se solicita (solo si los campos existen en BD)
        if (options?.expiresInDays && options.expiresInDays > 0) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + options.expiresInDays);
          updateData.expires_at = expiresAt.toISOString();
        }

        // Actualizar el archivo con los nuevos datos
        const { error } = await this.supa.client
          .from('files')
          .update(updateData)
          .eq('id', fileId);

        if (error) {
          console.error('[ShareService] generatePublicLinkFile error:', error);
          // Si hay error, probablemente es porque no existen los campos
          // Intentar actualizar solo con los campos básicos
          if (attempts === 0) {
            const { error: basicError } = await this.supa.client
              .from('files')
              .update({
                public_id: token,
                public_link_active: true
              })
              .eq('id', fileId);

            if (basicError) {
              throw basicError;
            }
          } else {
            throw error;
          }
        }

        const baseUrl = this.getPublicAppBaseUrl();
        const link = `${baseUrl}/public/${token}`;

        return {
          link,
          password: options?.withPassword ? updateData.password : undefined
        };
      }
      
      attempts++;
    }
    
    throw new Error('No se pudo generar un token único después de varios intentos');
  }

  /**
   * Desactiva el link público de un archivo
   */
  async deactivatePublicLinkFile(fileId: string): Promise<void> {
    const { error } = await this.supa.client
      .from('files')
      .update({
        public_link_active: false
      })
      .eq('id', fileId);

    if (error) {
      console.error('[ShareService] deactivatePublicLinkFile error:', error);
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════
  // COMPARTIR CARPETAS CON LINK PÚBLICO (Token corto)
  // ══════════════════════════════════════════════════════════

  /**
   * Genera un link público seguro para una carpeta usando token corto
   */
  async generatePublicLinkFolder(folderId: string): Promise<string> {
    // Intentar hasta 3 veces en caso de colisión de tokens
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      const token = this.generateShortToken();
      
      // Verificar si el token ya existe
      const { data: existing } = await this.supa.client
        .from('folders')
        .select('id')
        .eq('public_id', token)
        .maybeSingle();
      
      if (!existing) {
        // Token único encontrado, actualizar la carpeta
        const { error } = await this.supa.client
          .from('folders')
          .update({
            public_id: token,
            public_link_active: true
          })
          .eq('id', folderId);

        if (error) {
          console.error('[ShareService] generatePublicLinkFolder error:', error);
          throw error;
        }

        const baseUrl = this.getPublicAppBaseUrl();
        return `${baseUrl}/public-folder/${token}`;
      }
      
      attempts++;
    }
    
    throw new Error('No se pudo generar un token único para la carpeta después de varios intentos');
  }

  /**
   * Alias para compatibilidad con naming requerido
   */
  async enablePublicLinkFolder(folderId: string): Promise<string> {
    return this.generatePublicLinkFolder(folderId);
  }

  /**
   * Desactiva el link público de una carpeta
   */
  async deactivatePublicLinkFolder(folderId: string): Promise<void> {
    const { error } = await this.supa.client
      .from('folders')
      .update({
        public_link_active: false
      })
      .eq('id', folderId);

    if (error) {
      console.error('[ShareService] deactivatePublicLinkFolder error:', error);
      throw error;
    }
  }

  // ── COMPATIBILIDAD CON CÓDIGO EXISTENTE ──────────────
  async generatePublicLink(file: DriveFile): Promise<string> {
    const result = await this.generatePublicLinkFile(file.id!);
    return result.link;
  }

  // ── DESACTIVAR LINK PÚBLICO ───────────────────────────
  async deactivateLink(fileId: string, linkId: string): Promise<void> {
    console.warn('[ShareService] Firestore deshabilitado. Metodo no disponible.', fileId, linkId);
  }

  // ── OBTENER INFO DEL LINK (página pública) ────────────
  async getLinkData(token: string, password?: string): Promise<any | null> {
    try {
      // Obtener archivo por token público
      const { data: file, error } = await this.supa.client
        .from('files')
        .select('id, name, type, size, url, public_id, public_link_active')
        .eq('public_id', token)
        .maybeSingle();

      if (error || !file) {
        console.error('[ShareService] Archivo no encontrado:', error);
        return null;
      }

      // Validar que el link esté activo
      if (!file.public_link_active) {
        console.warn('[ShareService] Link desactivado');
        return null;
      }

      // Si existen los campos de contraseña y expiración, validarlos
      const { data: fileWithOptionalFields } = await this.supa.client
        .from('files')
        .select('*')
        .eq('public_id', token)
        .maybeSingle();

      if (fileWithOptionalFields) {
        // Validar expiración si existe el campo
        if (fileWithOptionalFields.expires_at) {
          const expiresAt = new Date(fileWithOptionalFields.expires_at);
          if (new Date() > expiresAt) {
            console.warn('[ShareService] Link expirado');
            await this.supa.client.from('files').update({ public_link_active: false }).eq('id', file.id);
            return null;
          }
        }

        // Validar contraseña si existe el campo
        if (fileWithOptionalFields.has_password && fileWithOptionalFields.password_hash) {
          if (!password) {
            return { 
              requiresPassword: true, 
              id: file.id,
              name: file.name,
              public_id: token
            };
          }

          const passwordValid = await this.verifyPassword(password, fileWithOptionalFields.password_hash);
          if (!passwordValid) {
            console.warn('[ShareService] Contraseña incorrecta');
            return null;
          }
        }

        // Incrementar contador atómicamente via RPC
        const { data: rpcCount, error: rpcError } = await this.supa.client
          .rpc('increment_file_view', { file_id: file.id });

        if (rpcError || rpcCount == null) {
          // RPC falló: fallback con UPDATE directo
          await this.supa.client
            .from('files')
            .update({ access_count: (fileWithOptionalFields.access_count || 0) + 1 })
            .eq('id', file.id);
        }

        // Leer el valor REAL desde la BD (ya actualizado por quien sea que llegó primero)
        const { data: freshCount } = await this.supa.client
          .from('files')
          .select('access_count')
          .eq('id', file.id)
          .maybeSingle();

        const finalCount = freshCount?.access_count ?? rpcCount ?? (fileWithOptionalFields.access_count || 0) + 1;

        return {
          id: file.id,
          name: file.name,
          type: file.type,
          size: file.size,
          url: file.url,
          active: file.public_link_active,
          accessCount: finalCount,
          sharedWith: fileWithOptionalFields.shared_with || [],
          expiresAt: fileWithOptionalFields?.expires_at || null
        };
      }

      return {
        id: file.id,
        name: file.name,
        type: file.type,
        size: file.size,
        url: file.url,
        active: file.public_link_active,
        accessCount: 0,
        sharedWith: [],
        expiresAt: null
      };
    } catch (err) {
      console.error('[ShareService] Error getting link data:', err);
      return null;
    }
  }

  // ── COMPARTIR CON USUARIO ESPECÍFICO ─────────────────
  async shareWithUser(fileId: string, perm: SharedPermission): Promise<void> {
    console.warn('[ShareService] Firestore deshabilitado. Metodo no disponible.', fileId, perm);
  }

  // ── QUITAR PERMISO ────────────────────────────────────
  async removePermission(fileId: string, uid: string): Promise<void> {
    console.warn('[ShareService] Firestore deshabilitado. Metodo no disponible.', fileId, uid);
  }

  // ── OBTENER LINKS DE UN ARCHIVO ───────────────────────
  async getFileLinks(fileId: string): Promise<ShareLink[]> {
    console.warn('[ShareService] Firestore deshabilitado. Metodo no disponible.', fileId);
    return [];
  }

  async shareFileByEmail(
    email: string,
    fileId: string,
    permission: 'viewer' | 'editor'
  ): Promise<boolean> {
    try {
      const { data: userData, error: userError } = await this.supa.client
        .from('users')
        .select('id, email')
        .eq('email', email)
        .maybeSingle();

      if (userError) {
        console.error('Error buscando usuario:', userError);
        return false;
      }

      if (!userData?.id) {
        throw new Error('Usuario no encontrado');
      }

      const { data: existingPerm, error: existingError } = await this.supa.client
        .from('permissions')
        .select('id')
        .eq('resource_type', 'file')
        .eq('resource_id', fileId)
        .eq('user_id', userData.id)
        .maybeSingle();

      if (existingError) {
        console.error('Error verificando permisos:', existingError);
        return false;
      }

      if (existingPerm?.id) {
        return true;
      }

      const { data, error } = await this.supa.client
        .from('permissions')
        .insert({
          resource_type: 'file',
          resource_id: fileId,
          user_id: userData.id,
          permission
        })
        .select()
        .single();

      if (error) {
        console.error('Insert error:', error);
        return false;
      }

      return !!data;
    } catch (err) {
      console.error('Error compartiendo archivo:', err);
      return false;
    }
  }

  // ── COPIAR AL PORTAPAPELES ────────────────────────────
  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  /** Comparte una carpeta con un usuario concreto, creando/actualizando el permiso en BD */
  async shareFolderByEmail(
    email: string,
    folderId: string,
    permission: 'viewer' | 'editor'
  ): Promise<boolean> {
    try {
      const { data: userData, error: userError } = await this.supa.client
        .from('users')
        .select('id, email')
        .eq('email', email)
        .maybeSingle();

      if (userError || !userData?.id) {
        console.error('[ShareService] shareFolderByEmail: usuario no encontrado', email);
        return false;
      }

      // Si ya existe el permiso, actualizarlo
      const { data: existing } = await this.supa.client
        .from('permissions')
        .select('id')
        .eq('resource_type', 'folder')
        .eq('resource_id', folderId)
        .eq('user_id', userData.id)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await this.supa.client
          .from('permissions')
          .update({ permission })
          .eq('id', existing.id);
        if (error) { console.error('[ShareService] update permission error', error); return false; }
        return true;
      }

      const { data, error } = await this.supa.client
        .from('permissions')
        .insert({
          resource_type: 'folder',
          resource_id: folderId,
          user_id: userData.id,
          permission
        })
        .select()
        .single();

      if (error) { console.error('[ShareService] insert permission error', error); return false; }
      return !!data;
    } catch (err) {
      console.error('[ShareService] shareFolderByEmail error:', err);
      return false;
    }
  }
}
