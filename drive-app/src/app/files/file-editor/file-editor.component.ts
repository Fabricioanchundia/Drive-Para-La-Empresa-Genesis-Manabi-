import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FileService } from '../../shared/Permission/services/file.service';
import { AuthService } from '../../shared/Permission/services/auth.service';
import { CollaborativeEditService } from '../../shared/Permission/services/collaborative-edit.service';
import { SupabaseService } from '../../shared/Permission/services/supabase.service';
import { DriveFile } from '../../shared/models/model';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface ActiveEditor {
  user_id: string;
  user_name: string;
  cursor_position: number;
  color: string;
}

@Component({
  selector: 'app-file-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './file-editor.component.html',
  styleUrls: ['./file-editor.component.css']
})
export class FileEditorComponent implements OnInit, OnDestroy {
  file: DriveFile | null = null;
  content = '';
  loading = true;
  error = '';
  isSaving = false;
  lastSyncTime = '';
  activeEditors: ActiveEditor[] = [];
  isTextEditable = false;
  officeViewerUrl: SafeResourceUrl | null = null;
  pdfUrl: SafeResourceUrl | null = null;
  pdfLoadError = false;
  videoUrl: SafeResourceUrl | null = null;
  audioUrl: SafeResourceUrl | null = null;
  private _pdfBlobUrl: string | null = null;

  // OnlyOffice
  useOnlyOffice = false;
  onlyOfficeError = '';
  private _onlyOfficeEditor: any = null;

  // Presencia en tiempo real (avatares de editores)
  presentUsers: { id: string; name: string; color: string; initials: string }[] = [];
  private _presenceChannel: RealtimeChannel | null = null;

  // Descarga
  isDownloading = false;
  showDlMenu = false;

  currentUserId = '';
  currentUserName = '';
  viewCount = 0;

  private autoSaveInterval: any;
  private presenceInterval: any;
  private lastContent = '';
  private _viewsChannel: RealtimeChannel | null = null;
  private _viewsPollInterval: any = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly sanitizer: DomSanitizer,
    private readonly fileSvc: FileService,
    private readonly authSvc: AuthService,
    private readonly collabSvc: CollaborativeEditService,
    private readonly supa: SupabaseService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadFileAndInitialize();
  }

  ngOnDestroy(): void {
    if (this.autoSaveInterval) clearInterval(this.autoSaveInterval);
    if (this.presenceInterval) clearInterval(this.presenceInterval);
    if (this._viewsPollInterval) clearInterval(this._viewsPollInterval);
    this.collabSvc.stopCollaboration();
    if (this._pdfBlobUrl) URL.revokeObjectURL(this._pdfBlobUrl);
    if (this._viewsChannel) {
      this.supa.client.removeChannel(this._viewsChannel);
      this._viewsChannel = null;
    }
    if (this._onlyOfficeEditor) {
      try { this._onlyOfficeEditor.destroyEditor(); } catch { /* noop */ }
      this._onlyOfficeEditor = null;
    }
    if (this._presenceChannel) {
      this.supa.client.removeChannel(this._presenceChannel);
      this._presenceChannel = null;
    }
  }

  private subscribeToViews(fileId: string): void {
    if (this._viewsChannel) this.supa.client.removeChannel(this._viewsChannel);
    if (this._viewsPollInterval) clearInterval(this._viewsPollInterval);

    this._viewsChannel = this.supa.client
      .channel(`editor-views-${fileId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'files', filter: `id=eq.${fileId}` },
        (payload) => {
          if (payload.new['access_count'] !== undefined) {
            this.viewCount = payload.new['access_count'];
            this.cdr.detectChanges();
          }
        }
      )
      .subscribe();

    // Polling cada 3 segundos como fallback
    // Fetch inmediato al entrar
    setTimeout(async () => {
      const { data } = await this.supa.client
        .from('files')
        .select('access_count')
        .eq('id', fileId)
        .maybeSingle();
      if (data?.access_count != null) {
        this.viewCount = data.access_count;
        this.cdr.detectChanges();
      }
    }, 1500);

    this._viewsPollInterval = setInterval(async () => {
      const { data } = await this.supa.client
        .from('files')
        .select('access_count')
        .eq('id', fileId)
        .maybeSingle();
      if (data?.access_count != null) {
        this.viewCount = data.access_count;
        this.cdr.detectChanges();
      }
    }, 3000);
  }

  private async loadFileAndInitialize(): Promise<void> {
    const fileId = this.route.snapshot.paramMap.get('fileId');
    
    if (!fileId) {
      this.error = 'ID de archivo inválido';
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    try {
      // Get user info
      const user = this.authSvc.currentUser;
      if (!user) {
        this.router.navigate(['/login']);
        return;
      }
      this.currentUserId = user.uid;
      this.currentUserName = user.email?.split('@')[0] || 'Anónimo';

      // Load file
      this.file = await this.fileSvc.getFileById(fileId);
      if (!this.file) {
        this.error = 'Archivo no encontrado';
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      // Cargar views actuales y suscribir a tiempo real
      const { data: fileData } = await this.supa.client
        .from('files')
        .select('access_count')
        .eq('id', fileId)
        .maybeSingle();
      this.viewCount = fileData?.access_count || 0;
      this.subscribeToViews(fileId);
      this.joinPresence(fileId);

      if (this.file.isShared && this.file.sharedPermission !== 'editor') {
        this.error = 'No tienes permiso de edición sobre este archivo compartido.';
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      this.isTextEditable = this.canEditAsText(this.file);

      if (this.isTextEditable && this.file.url) {
        this.content = await this.loadFileContent(this.file.url);
        this.lastContent = this.content;

        this.collabSvc.startCollaboration(fileId, this.currentUserId, this.currentUserName);

        this.autoSaveInterval = setInterval(() => {
          if (this.content !== this.lastContent) {
            this.saveChange();
          }
        }, 5000);

        this.presenceInterval = setInterval(() => {
          this.loadActiveEditors();
        }, 3000);
      } else if (this.file.url && this.isPDF()) {
        await this.loadPdfAsBlob(this.file.url);
      } else if (this.file.url && this.isOfficeDoc()) {
        this.useOnlyOffice = true;
        this.cdr.detectChanges();
        setTimeout(() => {
          this.initOnlyOffice().catch(e => {
            this.onlyOfficeError = e.message || 'No se pudo cargar el editor OnlyOffice';
            this.useOnlyOffice = false;
            this.cdr.detectChanges();
          });
        }, 300);
      } else if (this.file.url && this.isVideo()) {
        this.videoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.file.url);
      } else if (this.file.url && this.isAudio()) {
        this.audioUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.file.url);
      }

    } catch (err) {
      console.error('[FileEditor] Error:', err);
      this.error = 'Error al cargar el archivo';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private async loadPdfAsBlob(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        if (this._pdfBlobUrl) URL.revokeObjectURL(this._pdfBlobUrl);
        this._pdfBlobUrl = URL.createObjectURL(blob);
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this._pdfBlobUrl);
        this.pdfLoadError = false;
        return;
      }
    } catch { /* continúa al fallback */ }
    // Si falla (401 u otro error), mostrar mensaje de descarga
    this.pdfUrl = null;
    this.pdfLoadError = true;
  }

  private async loadFileContent(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      return await response.text();
    } catch {
      return '';
    }
  }

  async saveChange(): Promise<void> {
    if (!this.file?.id || this.isSaving) return;

    this.isSaving = true;
    try {
      const delta = {
        ops: [{ insert: this.content }]
      };

      await this.collabSvc.saveChange(
        this.file.id,
        this.currentUserId,
        this.currentUserName,
        delta,
        0
      );

      this.lastContent = this.content;
      this.lastSyncTime = this.formatTimeAgo(new Date());
      this.cdr.detectChanges();
    } catch (err) {
      console.error('[FileEditor] Save error:', err);
    } finally {
      this.isSaving = false;
    }
  }

  private async loadActiveEditors(): Promise<void> {
    if (!this.file?.id) return;
    
    try {
      this.activeEditors = await this.collabSvc.getActiveEditors(this.file.id);
      this.cdr.detectChanges();
    } catch (err) {
      console.error('[FileEditor] Load editors error:', err);
    }
  }

  onContentChange(): void {
    // Auto-save is handled by interval
  }

  canEditAsText(file: DriveFile): boolean {
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    const editableTypes = ['text/plain', 'text/markdown', 'application/json', 'text/html', 'text/css', 'text/javascript'];

    return editableTypes.some(t => type.includes(t)) ||
      name.endsWith('.txt') ||
      name.endsWith('.md') ||
      name.endsWith('.json') ||
      name.endsWith('.html') ||
      name.endsWith('.css') ||
      name.endsWith('.js');
  }

  isImage(): boolean {
    return this.file?.type?.startsWith('image/') || false;
  }

  isPDF(): boolean {
    return (this.file?.type || '').toLowerCase() === 'application/pdf';
  }

  isVideo(): boolean {
    return this.file?.type?.startsWith('video/') || false;
  }

  isAudio(): boolean {
    return this.file?.type?.startsWith('audio/') || false;
  }

  isOfficeDoc(): boolean {
    const t = (this.file?.type || '').toLowerCase();
    return t.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') ||
      t.includes('application/msword') ||
      t.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') ||
      t.includes('application/vnd.ms-excel') ||
      t.includes('application/vnd.openxmlformats-officedocument.presentationml.presentation') ||
      t.includes('application/vnd.ms-powerpoint');
  }

  private getOfficeFileType(): string {
    const name = (this.file?.name || '').toLowerCase();
    const ext  = name.split('.').pop() || '';
    const map: Record<string, string> = {
      docx: 'docx', doc: 'doc', odt: 'odt', rtf: 'rtf',
      xlsx: 'xlsx', xls: 'xls', ods: 'ods', csv: 'csv',
      pptx: 'pptx', ppt: 'ppt', odp: 'odp'
    };
    return map[ext] || 'docx';
  }

  private getOfficeDocumentType(): string {
    const name = (this.file?.name || '').toLowerCase();
    if (/\.(xlsx|xls|ods|csv)$/.test(name)) return 'cell';
    if (/\.(pptx|ppt|odp)$/.test(name))     return 'slide';
    return 'word';
  }

  private async initOnlyOffice(): Promise<void> {
    if (!this.file?.url) return;

    // Obtener JWT del usuario para el callback server
    const { data: { session } } = await this.supa.client.auth.getSession();
    const token       = session?.access_token || '';
    const storagePath = this.file.storagePath || '';

    // Hostname dinámico: funciona con localhost, 192.168.x.x, o cualquier IP
    const hostname = globalThis.location.hostname;

    // OnlyOffice corre en el mismo host que la app, pero en puerto 8080
    const onlyOfficeBase = `http://${hostname}:8080`;

    // Callback: usar el mismo hostname dinámico (el contenedor Docker puede
    // alcanzar al host por su IP real en Docker Desktop para Windows)
    const callbackUrl = `http://${hostname}:3001/callback` +
      `?path=${encodeURIComponent(storagePath)}&token=${encodeURIComponent(token)}`;

    // Key estable basado en el archivo: todos los usuarios que abran el mismo
    // archivo comparten la MISMA sesión de OnlyOffice → colaboración en tiempo real.
    // Se invalida al guardar (updatedAt cambia) para que cargue la versión nueva.
    const docKey = `${this.file.id}_${this.file.updatedAt instanceof Date
      ? Math.floor(this.file.updatedAt.getTime() / 1000)
      : String(this.file.updatedAt || '0').slice(0, 10).replaceAll(/\D/g, '')}`;

    const config = {
      document: {
        fileType: this.getOfficeFileType(),
        key:      docKey,
        title:    this.file.name,
        url:      this.file.url,
        permissions: {
          edit:     true,
          download: true,
          print:    true,
          review:   false,
          comment:  true
        }
      },
      documentType: this.getOfficeDocumentType(),
      editorConfig: {
        callbackUrl,
        lang: 'es',
        mode: 'edit',
        coEditing: {
          mode: 'fast',   // "fast" = cambios visibles al instante (como Google Docs)
          change: true    // permitir cambiar el modo dentro del editor
        },
        user: {
          id:   this.currentUserId,
          name: this.currentUserName
        },
        customization: {
          autosave:       true,
          forcesave:      true,
          compactToolbar: false,
          zoom:           100
        }
      },
      events: {
        onDocumentStateChange: (event: any) => {
          this.isSaving = !!event.data;
          if (!event.data) this.lastSyncTime = this.formatTimeAgo(new Date());
          this.cdr.detectChanges();
        },
        onReady: () => {
          this.lastSyncTime = 'Listo para editar';
          this.cdr.detectChanges();
        }
      }
    };

    // Cargar el script de OnlyOffice una sola vez (o recargarlo si cambió el host)
    const scriptId  = 'onlyoffice-api-script';
    const scriptSrc = `${onlyOfficeBase}/web-apps/apps/api/documents/api.js`;
    const existing  = document.getElementById(scriptId) as HTMLScriptElement | null;
    // Si el script ya está pero con otro host (IP cambió), lo eliminamos para recargarlo
    if (existing && existing.src !== scriptSrc) {
      existing.remove();
      delete (globalThis as any).DocsAPI;
    }
    if (!document.getElementById(scriptId)) {
      await new Promise<void>((resolve, reject) => {
        const script    = document.createElement('script');
        script.id       = scriptId;
        script.src      = scriptSrc;
        script.onload   = () => resolve();
        script.onerror  = () => reject(new Error(
          'OnlyOffice no disponible. ¿Está corriendo Docker?' +
          ' Ejecuta: docker start onlyoffice-ds'
        ));
        document.head.appendChild(script);
      });
    }

    const win = globalThis as any;
    if (!win.DocsAPI) throw new Error('DocsAPI no cargó correctamente.');

    if (this._onlyOfficeEditor) {
      try { this._onlyOfficeEditor.destroyEditor(); } catch { /* noop */ }
    }
    this._onlyOfficeEditor = new win.DocsAPI.DocEditor('onlyoffice-container', config);
  }

  private readonly AVATAR_COLORS = [
    '#e74c3c','#e67e22','#2ecc71','#3498db','#9b59b6',
    '#1abc9c','#e91e63','#ff5722','#00bcd4','#8bc34a'
  ];

  private strHash(s: string): number {
    return Math.abs(s.split('').reduce((a, c) => a + (c.codePointAt(0) ?? 0), 0));
  }

  private joinPresence(fileId: string): void {
    if (this._presenceChannel) this.supa.client.removeChannel(this._presenceChannel);

    const myColor    = this.AVATAR_COLORS[this.strHash(this.currentUserId) % this.AVATAR_COLORS.length];
    const myInitials = this.currentUserName.slice(0, 2).toUpperCase();

    const channel = this.supa.client.channel(`presence-editor-${fileId}`, {
      config: { presence: { key: this.currentUserId } }
    });
    this._presenceChannel = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        this.presentUsers = Object.entries(state).map(([id, presences]: [string, any]) => {
          const p   = presences[0];
          const idx = this.strHash(id) % this.AVATAR_COLORS.length;
          return { id, name: p.name || id, color: this.AVATAR_COLORS[idx], initials: (p.name || id).slice(0, 2).toUpperCase() };
        });
        this.cdr.detectChanges();
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ name: this.currentUserName, color: myColor, initials: myInitials });
        }
      });
  }

  async downloadOriginal(): Promise<void> {
    if (!this.file?.url || this.isDownloading) return;
    this.isDownloading = true;
    this.cdr.detectChanges();
    try {
      const resp = await fetch(this.file.url);
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = this.file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } finally {
      this.isDownloading = false;
      this.cdr.detectChanges();
    }
  }

  async downloadAsPDF(): Promise<void> {
    if (!this.file?.url || this.isDownloading) return;
    this.isDownloading = true;
    this.cdr.detectChanges();
    try {
      const hostname      = globalThis.location.hostname;
      const onlyOfficeBase = `http://${hostname}:8080`;
      const docKey        = `${this.file.id}_pdf_${Date.now()}`;
      const pdfName       = this.file.name.replace(/\.[^.]+$/, '') + '.pdf';

      const resp = await fetch(`${onlyOfficeBase}/ConvertService.ashx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          async: false,
          embeddedfonts: true,
          filetype:   this.getOfficeFileType(),
          key:        docKey,
          outputtype: 'pdf',
          title:      pdfName,
          url:        this.file.url
        })
      });
      const json = await resp.json();
      if (json.fileUrl) {
        const a    = document.createElement('a');
        a.href     = json.fileUrl;
        a.download = pdfName;
        a.target   = '_blank';
        a.click();
      } else {
        alert('No se pudo convertir a PDF. Usa Archivo > Descargar dentro del editor.');
      }
    } catch {
      alert('Error al convertir a PDF. Usa Archivo > Descargar dentro del editor.');
    } finally {
      this.isDownloading = false;
      this.cdr.detectChanges();
    }
  }

  private formatTimeAgo(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return 'Hace unos segundos';
    if (minutes < 60) return `Hace ${minutes}m`;
    if (hours < 24) return `Hace ${hours}h`;
    return date.toLocaleDateString();
  }

  getEditorColor(index: number): string {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];
    return colors[index % colors.length];
  }

  goBack(): void {
    this.router.navigate(['/files']);
  }
}
