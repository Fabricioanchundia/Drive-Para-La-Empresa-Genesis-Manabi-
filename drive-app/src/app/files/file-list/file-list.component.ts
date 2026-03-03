import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { SupabaseService } from '../../shared/Permission/services/supabase.service';
import { AuthService } from '../../shared/Permission/services/auth.service';
import { CloudinaryService } from '../../shared/Permission/services/cloudinary.service';
import { ShareService } from '../../shared/Permission/services/share.service';
import { EmailService } from '../../shared/Permission/services/email.service';
import { FileService } from '../../shared/Permission/services/file.service';
import { DriveFile, Folder } from '../../shared/models/model';
import { FileSectionComponent } from '../file-section/file-section.component';
import { FolderSectionComponent } from '../folder-section/folder-section.component';

@Component({
  selector: 'app-file-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FileSectionComponent, FolderSectionComponent],
  templateUrl: './file-list.component.html',
  styleUrls: ['./file-list.component.css']
})
export class FileListComponent implements OnInit, OnDestroy {
  private supa       = inject(SupabaseService);
  private cloudinary = inject(CloudinaryService);
  private shareSvc   = inject(ShareService);
  private emailSvc   = inject(EmailService);
  private fileSvc    = inject(FileService);
  private cdr        = inject(ChangeDetectorRef);

  files:      DriveFile[] = [];
  folders:    Folder[]    = [];
  breadcrumb: Folder[]    = [];
  currentFolderId: string | null = null;

  loading     = false;
  private sub?: Subscription;
  private authSub?: { unsubscribe: () => void };
  uploading   = false;
  uploadPct   = 0;
  private uploadStartedAt = 0;
  errorMsg    = '';
  successMsg  = '';

  filterText   = '';
  filterType   = 'all';
  filterStatus = 'all';
  filterDate   = 'all';

  showNewFolder = false;
  newFolderName = '';
  creatingFolder = false;

  showShareModal   = false;
    showEmailShareModal = false;
  selectedFile:    DriveFile | null = null;
  shareEmail       = '';
    sharePermission: 'viewer' | 'editor' = 'viewer';
  generatedLink    = '';
  linkCopied       = false;
  actionMenuFileId: string | null = null;

  viewMode: 'files' | 'folders' = 'files';

  constructor(public authSvc: AuthService) {}

  private get uid(): string {
    return this.supa.client.auth.getUser().then(r => r.data.user?.id || '') as any;
  }

  async ngOnInit(): Promise<void> {
    console.log('[FileList] ngOnInit - Iniciando');
    
    try {
      const { data } = await this.supa.client.auth.getSession();
      const uid = data.session?.user?.id;
      
      console.log('[FileList] UID:', uid || 'sin sesión');

      if (uid) {
        await this.load(uid);
      } else {
        console.warn('[FileList] Sin sesión válida');
        this.loading = false;
      }
      
    } catch (err) {
      console.error('[FileList] Error en ngOnInit:', err);
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.authSub?.unsubscribe();
  }

  private async loadFromSessionOrWait(): Promise<void> {
    // MÉTODO ELIMINADO - Todo se hace directo en ngOnInit
  }

  async load(uidOverride?: string): Promise<void> {
    console.log('[FileList] load() - Iniciando');
    
    let uid = uidOverride || this.authSvc.currentUser?.uid || '';

    if (!uid) {
      const { data } = await this.supa.client.auth.getUser();
      uid = data.user?.id || '';
    }

    if (!uid) {
      console.log('[FileList] load() - Sin UID, deteniendo');
      this.loading = false;
      this.files   = [];
      this.folders = [];
      this.cdr.detectChanges();
      return;
    }

    // Activar loading
    this.loading  = true;
    this.errorMsg = '';
    this.cdr.detectChanges();
    
    // Timeout de seguridad: 4 segundos MAX
    const safetyTimeout = setTimeout(() => {
      console.error('[FileList] ⚠️ TIMEOUT DE SEGURIDAD - Forzando loading=false');
      this.loading = false;
      this.cdr.detectChanges();
    }, 4000);

    try {
      const fid = this.currentFolderId;
      console.log('[FileList] load() - Consultando DB, folderId:', fid || 'raíz');

      // Cargar archivos propios
      const fileQuery = this.supa.client
        .from('files')
        .select('id,name,type,size,url,public_id,folder_id,owner_id,public_link_active,public_link,shared_with,created_at,updated_at')
        .eq('owner_id', uid)
        .is('folder_id', fid)
        .order('created_at', { ascending: false });

      // Si estamos en la raíz, también cargar archivos compartidos
      let sharedFiles: DriveFile[] = [];
      if (fid === null) {
        sharedFiles = await this.fileSvc.getSharedFiles();
      }

      const [filesRes, foldersRes] = await Promise.all([
        fileQuery,
        this.supa.client.from('folders')
          .select('id,name,parent_id,owner_id,created_at')
          .eq('owner_id', uid)
          .is('parent_id', fid)
          .order('created_at', { ascending: true })
      ]);

      this.files   = (filesRes.data || [])
        .map((r: any) => this.mapFile(r))
        .concat(sharedFiles);
      
      this.folders = (foldersRes.data || []).map((r: any) => this.mapFolder(r));
      console.log('[FileList] load() - ✅ Completado:', this.files.length, 'archivos,', this.folders.length, 'carpetas');

    } catch(e: any) {
      console.error('[FileList] load() - ❌ Error:', e?.message);
      this.errorMsg = 'Error al cargar archivos';
      this.files = [];
      this.folders = [];
    } finally {
      clearTimeout(safetyTimeout);
      
      // FORZAR loading=false de manera agresiva
      this.loading = false;
      this.cdr.detectChanges();
      
      // Double-check con timeout para asegurar
      setTimeout(() => {
        if (this.loading === true) {
          console.error('[FileList] 🔥 FORZANDO loading=false NUEVAMENTE');
          this.loading = false;
          this.cdr.detectChanges();
        }
      }, 100);
      
      console.log('[FileList] load() - Finalizado (loading=' + this.loading + ')');
    }
  }

  async openFolder(folder: Folder): Promise<void> {
    this.currentFolderId = folder.id!;
    this.breadcrumb      = [...this.breadcrumb, folder];
    await this.load();
  }

  async goRoot(): Promise<void> {
    this.currentFolderId = null;
    this.breadcrumb      = [];
    await this.load();
  }

  async goBack(): Promise<void> {
    this.breadcrumb.pop();
    this.currentFolderId = this.breadcrumb.length > 0
      ? this.breadcrumb[this.breadcrumb.length - 1].id! : null;
    await this.load();
  }

  async createFolder(): Promise<void> {
    if (this.creatingFolder) return;
    const name = this.newFolderName.trim();
    if (!name) { this.errorMsg = 'Escribe un nombre.'; return; }

    this.creatingFolder = true;
    this.errorMsg = '';

    const uid = this.authSvc.currentUser?.uid
      || (await this.supa.client.auth.getUser()).data.user?.id
      || '';

    if (!uid) {
      this.errorMsg = 'Sesion no valida. Inicia sesion de nuevo.';
      this.creatingFolder = false;
      return;
    }

    try {
      const { data, error } = await this.supa.client
        .from('folders')
        .insert({
          name,
          parent_id:  this.currentFolderId,
          owner_id:   uid,
          created_at: new Date().toISOString()
        })
        .select('*')
        .single();

      if (error || !data) {
        this.errorMsg = error?.message || 'Error al crear carpeta.';
        return;
      }

      this.folders = [this.mapFolder(data), ...this.folders];
      this.newFolderName = '';
      this.showNewFolder = false;
      this.showSuccess(`Carpeta "${name}" creada.`);
      void this.load();
    } finally {
      this.creatingFolder = false;
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];

    const { data: { user } } = await this.supa.client.auth.getUser();
    const uid = user?.id || '';
    if (!uid) return;

    this.uploading = true;
    this.uploadPct = 0;
    this.uploadStartedAt = Date.now();
    this.cdr.detectChanges();
    this.errorMsg  = '';

    try {
      const { url, publicId } = await this.cloudinary.uploadFile(file, (pct) => {
        this.uploadPct = pct;
        this.cdr.detectChanges();
      });

      const { error } = await this.supa.client.from('files').insert({
        name:               file.name,
        type:               file.type || 'application/octet-stream',
        size:               file.size,
        url,
        public_id:          publicId,
        folder_id:          this.currentFolderId,
        owner_id:           uid,
        public_link_active: false,
        shared_with:        [],
        created_at:         new Date().toISOString(),
        updated_at:         new Date().toISOString()
      });

      if (error) throw new Error(error.message);

      this.showSuccess(`"${file.name}" subido correctamente.`);
      await this.finishUploadUI();
      await this.load();

    } catch(e: any) {
      this.errorMsg = `Error: ${e?.message}`;
    } finally {
      await this.finishUploadUI();
      input.value    = '';
    }
  }

  private async finishUploadUI(): Promise<void> {
    if (!this.uploading) return;
    const minMs = 600;
    const elapsed = Date.now() - this.uploadStartedAt;
    if (elapsed < minMs) {
      await new Promise(r => setTimeout(r, minMs - elapsed));
    }
    this.uploading = false;
    this.uploadPct = 0;
    this.cdr.detectChanges();
  }

  async deleteFile(file: DriveFile): Promise<void> {
    if (!confirm(`¿Eliminar "${file.name}"?`)) return;
    this.closeActionMenu();
    this.files = this.files.filter(f => f.id !== file.id);
    const { error } = await this.supa.client.from('files').delete().eq('id', file.id!);
    if (error) { this.errorMsg = error.message; await this.load(); }
    else this.showSuccess(`"${file.name}" eliminado.`);
  }

  downloadFile(file: DriveFile): void {
    if (!file.url) return;
    window.open(file.url, '_blank');
  }

  async deleteFolder(folder: Folder): Promise<void> {
    if (!confirm(`¿Eliminar "${folder.name}"?`)) return;
    this.folders = this.folders.filter(f => f.id !== folder.id);
    const { error } = await this.supa.client.from('folders').delete().eq('id', folder.id!);
    if (error) { this.errorMsg = error.message; await this.load(); }
    else this.showSuccess(`"${folder.name}" eliminada.`);
  }

  openShare(file: DriveFile): void {
    this.selectedFile   = file;
    this.showShareModal = true;
    const baseUrl = this.shareSvc.getPublicAppBaseUrl();
    this.generatedLink  = file.publicId && file.publicLinkActive
      ? `${baseUrl}/public/${file.publicId}`
      : '';
    this.shareEmail     = '';
    this.linkCopied     = false;
  }

  closeShare(): void {
    this.showShareModal = false;
    this.selectedFile   = null;
    this.generatedLink  = '';
      this.linkCopied     = false;
  }

    closeEmailShare(): void {
      this.showEmailShareModal = false;
      this.selectedFile   = null;
      this.shareEmail     = '';
      this.linkCopied     = false;
      this.successMsg     = '';
      this.errorMsg       = '';
    }
  async generateLink(): Promise<void> {
    if (!this.selectedFile) return;
    try {
      const result = await this.shareSvc.generatePublicLinkFile(this.selectedFile.id!);
      this.generatedLink = result.link;
      this.showSuccess('Link público generado.' + (result.password ? ` Contraseña: ${result.password}` : ''));
      await this.load();
    } catch {
      this.errorMsg = 'No se pudo generar el link público.';
    }
  }

  async togglePublic(file: DriveFile): Promise<void> {
    try {
      if (file.publicLinkActive) {
        await this.shareSvc.deactivatePublicLinkFile(file.id!);
        this.showSuccess('Link público desactivado.');
      } else {
        await this.shareSvc.generatePublicLinkFile(file.id!);
        this.showSuccess('Link público generado.');
      }
      this.closeActionMenu();
      await this.load();
    } catch {
      this.errorMsg = 'No se pudo actualizar el link público.';
    }
  }

  copyPublicLink(file: DriveFile): void {
    if (!file.publicId) return;
    const baseUrl = this.shareSvc.getPublicAppBaseUrl();
    const link = `${baseUrl}/public/${file.publicId}`;
    navigator.clipboard.writeText(link);
    this.showSuccess('Link copiado.');
    this.closeActionMenu();
  }

  toggleActionMenu(file: DriveFile, event: MouseEvent): void {
    event.stopPropagation();
    this.actionMenuFileId = this.actionMenuFileId === file.id ? null : file.id || null;
  }

  closeActionMenu(): void {
    this.actionMenuFileId = null;
  }

  copyLink(): void {
    if (!this.generatedLink) {
      console.error('No hay link para copiar');
      return;
    }

    // Método moderno: Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(this.generatedLink)
        .then(() => {
          console.log('Link copiado al portapapeles');
          this.linkCopied = true;
          setTimeout(() => {
            this.linkCopied = false;
          }, 2500);
        })
        .catch(err => {
          console.error('Error con clipboard API:', err);
          this.fallbackCopyToClipboard();
        });
    } else {
      // Fallback para navegadores antiguos
      this.fallbackCopyToClipboard();
    }
  }

  private fallbackCopyToClipboard(): void {
    const textarea = document.createElement('textarea');
    textarea.value = this.generatedLink;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    
    try {
      textarea.select();
      document.execCommand('copy');
      console.log('Link copiado (fallback)');
      this.linkCopied = true;
      setTimeout(() => {
        this.linkCopied = false;
      }, 2500);
    } catch (err) {
      console.error('Error al copiar:', err);
    } finally {
      document.body.removeChild(textarea);
    }
  }

  async shareWithUser(): Promise<void> {
    if (!this.selectedFile || !this.shareEmail.trim()) {
      this.errorMsg = 'Por favor ingresa un correo válido.';
      this.successMsg = '';
      this.cdr.detectChanges();
      return;
    }

    const email = this.shareEmail.trim();
    const fileId = this.selectedFile.id!;
    const fileName = this.selectedFile.name;

    try {
      // Limpiar mensajes previos
      this.errorMsg = '';
      this.successMsg = '';
      this.cdr.detectChanges();
      
      // Crear permiso en tabla 'permissions'
      const success = await this.shareSvc.shareFileByEmail(
        email, 
        fileId, 
        this.sharePermission as 'viewer' | 'editor'
      );

      if (success) {
        const publicId = this.selectedFile.publicId;
        
        // Activar link público + construir URL en paralelo (sin bloquear)
        const baseUrl = this.shareSvc.getPublicAppBaseUrl();
        const accessLink = publicId
          ? `${baseUrl}/public/${publicId}`
          : `${baseUrl}/files/view/${fileId}`;
        const senderName = this.authSvc.currentUser?.displayName || 'Un usuario';
        const isEditor = this.sharePermission === 'editor';

        // Editores reciben link directo al editor (/edit/:fileId)
        // Viewers reciben el link público de solo lectura
        const emailAccessLink = isEditor
          ? `${baseUrl}/edit/${fileId}`
          : accessLink;
        const [emailSent] = await Promise.all([
          this.emailSvc.sendShareInvitation(
            email, fileName, emailAccessLink, senderName, this.sharePermission
          ),
          publicId
            ? this.supa.client.from('files')
                .update({ public_link_active: true })
                .eq('id', fileId)
            : Promise.resolve()
        ]);

        if (emailSent) {
          this.successMsg = `✅ Correo enviado a ${email}`;
          this.errorMsg = '';
        } else {
          this.errorMsg = 'Permiso creado pero el correo falló';
          this.successMsg = '';
        }
        this.cdr.detectChanges();

        // Recargar datos en background (sin bloquear el cierre del modal)
        this.load().then(() => {
          this.selectedFile = this.files.find(f => f.id === fileId) || this.selectedFile;
        });

        // Limpiar y cerrar modal en 1.5 segundos
        setTimeout(() => {
          this.shareEmail = '';
          this.sharePermission = 'viewer';
          this.showEmailShareModal = false;
          this.successMsg = '';
          this.errorMsg = '';
          this.cdr.detectChanges();
        }, 1500);
        
      } else {
        this.errorMsg = 'No se pudo compartir. Verifica que el usuario exista.';
        this.successMsg = '';
        this.cdr.detectChanges();
      }
    } catch (error: any) {
      this.errorMsg = error?.message || 'Error al compartir el archivo.';
      this.successMsg = '';
      this.cdr.detectChanges();
    }
  }
  async removePermissionWithConfirm(email: string): Promise<void> {
    if (!confirm(`¿Eliminar acceso para ${email}?`)) return;
    await this.removePermission(email);
  }

  async removePermission(email: string): Promise<void> {
    if (!this.selectedFile) return;
    const updated = (this.selectedFile.sharedWith || [])
      .filter((p: any) => p.email !== email);
    await this.supa.client.from('files')
      .update({ shared_with: updated })
      .eq('id', this.selectedFile.id!);
    this.showSuccess('Permiso eliminado.');
    await this.load();
    this.selectedFile = this.files.find(f => f.id === this.selectedFile?.id) || null;
  }

  async resendInvitation(email: string): Promise<void> {
    if (!this.selectedFile) return;
    
    const permission = (this.selectedFile.sharedWith || [])
      .find((p: any) => p.email === email)?.permission || 'viewer';
    
    try {
      const publicId = this.selectedFile.publicId;
      console.log('[ResendInvitation] Public ID del archivo:', publicId);
      
      // Activar el link público automáticamente al reenviar
      if (publicId) {
        await this.supa.client
          .from('files')
          .update({ public_link_active: true })
          .eq('id', this.selectedFile.id!);
        console.log('[ResendInvitation] Link público activado');
      }
      
      const baseUrl = this.shareSvc.getPublicAppBaseUrl();
      const accessLink = publicId
        ? `${baseUrl}/public/${publicId}`
        : `${baseUrl}/files/view/${this.selectedFile.id}`;
      
      console.log('[ResendInvitation] Link generado:', accessLink);
      
      // Enviar correo real usando EmailJS
      const emailSent = await this.emailSvc.resendInvitation(
        email,
        this.selectedFile.name,
        accessLink,
        permission
      );
      
      if (emailSent) {
        this.showSuccess(`Invitación reenviada a ${email}`);
      } else {
        this.showSuccess(`Email simulado enviado (configura EmailJS para envío real)`);
      }
    } catch (error: any) {
      this.errorMsg = 'Error al reenviar la invitación';
    }
  }

  async deactivatePublicLink(): Promise<void> {
    if (!this.selectedFile?.id) return;
    
    try {
      await this.shareSvc.deactivatePublicLinkFile(this.selectedFile.id);
      this.generatedLink = '';
      this.showSuccess('Link público desactivado correctamente.');
      await this.load();
    } catch (error: any) {
      this.errorMsg = error?.message || 'Error al desactivar el link público.';
    }
  }

  async loadSharedUsers(): Promise<void> {
    if (!this.selectedFile?.id) return;
    
    // TODO: Cargar usuarios con permisos desde tabla 'permissions'
    // Por ahora solo recargamos los archivos
    await this.load();
  }

  private showSuccess(msg: string): void {
    this.successMsg = msg;
    setTimeout(() => this.successMsg = '', 3000);
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

  formatSize(b: number): string {
    if (!b) return '0 B';
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
    return `${(b/1048576).toFixed(1)} MB`;
  }

  getIcon(type: string): string {
    if (!type) return 'FILE';
    const t = type.toLowerCase();
    if (t.includes('image'))                                         return 'IMG';
    if (t.includes('pdf'))                                           return 'PDF';
    if (t.includes('video'))                                         return 'VID';
    if (t.includes('audio'))                                         return 'AUD';
    if (t.includes('zip')||t.includes('rar')||t.includes('7z'))      return 'ZIP';
    if (t.includes('sheet')||t.includes('excel')||t.includes('csv')) return 'XLS';
    if (t.includes('word')||t.includes('document'))                  return 'DOC';
    if (t.includes('presentation')||t.includes('powerpoint'))        return 'PPT';
    if (t.includes('text')||t.includes('plain'))                     return 'TXT';
    return 'FILE';
  }

  get availableTypes(): string[] {
    const types = new Set(this.files.map(f => this.getIcon(f.type)));
    return ['all', ...Array.from(types)];
  }

  get filteredFiles(): DriveFile[] {
    const text = this.filterText.trim().toLowerCase();
    const now = Date.now();
    return this.files.filter(file => {
      if (text && !file.name.toLowerCase().includes(text)) return false;

      if (this.filterType !== 'all') {
        if (this.getIcon(file.type) !== this.filterType) return false;
      }

      if (this.filterStatus !== 'all') {
        const isPublic = !!file.publicLinkActive;
        if (this.filterStatus === 'public' && !isPublic) return false;
        if (this.filterStatus === 'private' && isPublic) return false;
      }

      if (this.filterDate !== 'all') {
        const created = file.createdAt?.getTime() || 0;
        if (this.filterDate === 'today') {
          const dayStart = new Date();
          dayStart.setHours(0, 0, 0, 0);
          if (created < dayStart.getTime()) return false;
        }
        if (this.filterDate === '7d' && now - created > 7 * 86400000) return false;
        if (this.filterDate === '30d' && now - created > 30 * 86400000) return false;
        if (this.filterDate === '1y' && now - created > 365 * 86400000) return false;
      }

      return true;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // HANDLERS PARA COMPONENTES SEPARADOS
  // ═══════════════════════════════════════════════════════════════

  setViewMode(mode: 'files' | 'folders'): void {
    this.viewMode = mode;
  }

  onFolderClick(folderId: string): void {
    const folder = this.folders.find(f => f.id === folderId);
    if (folder) {
      this.openFolder(folder);
    }
  }

  onFolderDelete(folderId: string): void {
    const folder = this.folders.find(f => f.id === folderId);
    if (folder) {
      void this.deleteFolder(folder);
    }
  }

  onFileDelete(file: DriveFile): void {
    void this.deleteFile(file);
  }

  onFileShare(file: DriveFile): void {
    // Abrir modal de compartir por CORREO (no link público)
    this.selectedFile = file;
    console.log('[onFileShare] Archivo seleccionado:', file.name, 'publicId:', file.publicId);
    this.showEmailShareModal = true;
    this.shareEmail = '';
    this.sharePermission = 'viewer';
  }

  onFileDownload(file: DriveFile): void {
    this.downloadFile(file);
  }
}