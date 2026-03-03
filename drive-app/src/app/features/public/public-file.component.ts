import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FileService } from '../../shared/Permission/services/file.service';
import { ShareService } from '../../shared/Permission/services/share.service';
import { SupabaseService } from '../../shared/Permission/services/supabase.service';
import type { RealtimeChannel } from '@supabase/supabase-js';

type PublicFileData = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  accessCount?: number;
  expiresAt?: string;
};

@Component({
  selector: 'app-public-file',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './public-file.component.html',
  styleUrls: ['./public-file.component.css']
})
export class PublicFileComponent implements OnInit, OnDestroy {
  loading = true;
  error = false;
  errorMessage = '';
  file: PublicFileData | null = null;
  officeViewerUrl: SafeResourceUrl | null = null;
  pdfUrl: SafeResourceUrl | null = null;
  pdfLoadError = false;
  videoUrl: SafeResourceUrl | null = null;
  audioUrl: SafeResourceUrl | null = null;
  textUrl: SafeResourceUrl | null = null;
  requiresPassword = false;
  canEdit = false;       // usuario logueado con permiso editor
  notLoggedEditor = false; // el link es de editor pero no está logueado
  private _pdfBlobUrl: string | null = null;
  private _realtimeChannel: RealtimeChannel | null = null;
  private _pollInterval: any = null;
  password = '';
  token = '';
  fileId = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly fileSvc: FileService,
    private readonly shareSvc: ShareService,
    private readonly sanitizer: DomSanitizer,
    private readonly cdr: ChangeDetectorRef,
    private readonly supa: SupabaseService
  ) {}

  ngOnInit(): void {
    this.loadFile();
  }

  ngOnDestroy(): void {
    if (this._pdfBlobUrl) URL.revokeObjectURL(this._pdfBlobUrl);
    if (this._realtimeChannel) {
      this.supa.client.removeChannel(this._realtimeChannel);
      this._realtimeChannel = null;
    }
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  private async fetchCurrentViews(): Promise<void> {
    if (!this.fileId || !this.file) return;
    const { data } = await this.supa.client
      .from('files')
      .select('access_count')
      .eq('id', this.fileId)
      .maybeSingle();
    if (data && data.access_count != null && this.file) {
      this.file = { ...this.file, accessCount: data.access_count };
      this.cdr.detectChanges();
    }
  }

  private subscribeToViews(fileId: string): void {
    this.fileId = fileId;
    if (this._realtimeChannel) {
      this.supa.client.removeChannel(this._realtimeChannel);
    }
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
    }

    // Intentar Realtime (requiere replicación activada en Supabase)
    this._realtimeChannel = this.supa.client
      .channel(`file-views-${fileId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'files', filter: `id=eq.${fileId}` },
        (payload) => {
          if (this.file && payload.new['access_count'] != null) {
            this.file = { ...this.file, accessCount: payload.new['access_count'] };
            this.cdr.detectChanges();
          }
        }
      )
      .subscribe();

    // Fetch inmediato al entrar (sin esperar el primer intervalo)
    setTimeout(() => this.fetchCurrentViews(), 1500);

    // Polling cada 3 segundos como fallback garantizado
    this._pollInterval = setInterval(() => {
      this.fetchCurrentViews();
    }, 3000);
  }

  private async loadFile(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token');

    if (!token) {
      this.loading = false;
      this.error = true;
      this.errorMessage = 'Link inválido.';
      this.cdr.detectChanges();
      return;
    }

    this.token = token;
    await this.fetchFile();
  }

  async fetchFile(password?: string): Promise<void> {
    try {
      this.loading = true;
      this.error = false;

      const linkData = await this.shareSvc.getLinkData(this.token, password);
      
      if (!linkData) {
        this.error = true;
        this.errorMessage = 'Este archivo no está disponible o el link ha expirado.';
      } else if (linkData.requiresPassword) {
        this.requiresPassword = true;
        this.errorMessage = '';
      } else {
        this.file = linkData;
        this.requiresPassword = false;
        // Suscribir a views en tiempo real
        if (linkData.id) this.subscribeToViews(linkData.id);

        // Verificar si el usuario logueado tiene permiso editor
        this.canEdit = false;
        this.notLoggedEditor = false;
        const sharedWith: any[] = linkData.sharedWith || [];
        if (sharedWith.length > 0) {
          const { data: sessionData } = await this.supa.client.auth.getSession();
          const sessionEmail = sessionData?.session?.user?.email || null;
          if (sessionEmail) {
            const myPerm = sharedWith.find(
              (p: any) => p.email?.toLowerCase() === sessionEmail.toLowerCase()
            );
            this.canEdit = myPerm?.permission === 'editor' || myPerm?.permission === 'edit';
          } else {
            // Hay shared_with con editor pero no está logueado
            const hasEditor = sharedWith.some(
              (p: any) => p.permission === 'editor' || p.permission === 'edit'
            );
            this.notLoggedEditor = hasEditor;
          }
        }

        this.pdfUrl = null;
        this.pdfLoadError = false;
        this.officeViewerUrl = null;
        this.videoUrl = null;
        this.audioUrl = null;
        this.textUrl = null;

        if (this.isOfficeDoc()) {
          const url = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(this.file!.url)}`;
          this.officeViewerUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
        } else if (this.isPDF()) {
          await this.loadPdfAsBlob(this.file!.url);
        } else if (this.isVideo()) {
          this.videoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.file!.url);
        } else if (this.isAudio()) {
          this.audioUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.file!.url);
        } else if (this.isText()) {
          this.textUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.file!.url);
        }
      }
    } catch (err) {
      console.error('[PublicFile] Error:', err);
      this.error = true;
      this.errorMessage = 'Error al cargar el archivo.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async submitPassword(): Promise<void> {
    if (!this.password.trim()) {
      this.errorMessage = 'Ingresa la contraseña para continuar.';
      return;
    }

    await this.fetchFile(this.password);
  }

  private async loadPdfAsBlob(url: string): Promise<void> {
    try {
      // Intentar fetch para crear blob URL (evita problemas de seguridad del iframe)
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) {
        const blob = await response.blob();
        if (this._pdfBlobUrl) URL.revokeObjectURL(this._pdfBlobUrl);
        this._pdfBlobUrl = URL.createObjectURL(blob);
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this._pdfBlobUrl);
        this.pdfLoadError = false;
        return;
      }
    } catch { /* fallback: usar URL directa */ }
    // Fallback: usar la URL directamente en el iframe
    try {
      this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      this.pdfLoadError = false;
    } catch {
      this.pdfUrl = null;
      this.pdfLoadError = true;
    }
  }

  goToEdit(): void {
    this.router.navigate(['/edit', this.file!.id]);
  }

  goToLogin(): void {
    // Guardar la URL actual para redirigir después del login
    sessionStorage.setItem('redirectAfterLogin', `/public/${this.token}`);
    this.router.navigate(['/login']);
  }

  isImage(): boolean {
    return this.file?.type.startsWith('image/') || false;
  }

  isPDF(): boolean {
    return this.file?.type === 'application/pdf' || false;
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

  isVideo(): boolean {
    return this.file?.type.startsWith('video/') || false;
  }

  isAudio(): boolean {
    return this.file?.type.startsWith('audio/') || false;
  }

  isText(): boolean {
    const t = (this.file?.type || '').toLowerCase();
    return t.startsWith('text/') || t.includes('json') || t.includes('xml') || t.includes('csv');
  }

  formatSize(bytes: number): string {
    return this.fileSvc.formatSize(bytes);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }
}
