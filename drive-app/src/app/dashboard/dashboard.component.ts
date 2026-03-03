import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../shared/Permission/services/auth.service';
import { FileService } from '../shared/Permission/services/file.service';
import { FolderService } from '../shared/Permission/services/folder.service';
import { SupabaseService } from '../shared/Permission/services/supabase.service';
import { DriveFile, User, SharedItem } from '../shared/models/model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  private supa    = inject(SupabaseService);
  private router  = inject(Router);
  private cdr     = inject(ChangeDetectorRef);
  private fileSvc = inject(FileService);
  private folderSvc = inject(FolderService);

  user:         User | null = null;
  sharedWithMe: SharedItem[] = [];
  menuOpen      = false;
  totalFiles    = 0;
  totalFolders  = 0;
  loading       = true;

  constructor(public authSvc: AuthService) {}

  async ngOnInit(): Promise<void> {
    await this.authSvc.authReady;

    if (this.authSvc.isAdmin()) {
      this.router.navigate(['/admin']);
      return;
    }

    this.authSvc.currentUser$.subscribe(async (u) => {
      if (u?.role === 'admin') { this.router.navigate(['/admin']); return; }
      if (u) {
        this.user = u;
        await this.loadStats(u.uid);
        await this.loadSharedWithMe();
      }
      this.loading = false;
      this.cdr.detectChanges();
    });
  }

  async loadStats(uid: string): Promise<void> {
    try {
      const [filesRes, foldersRes] = await Promise.all([
        this.supa.client.from('files').select('size').eq('owner_id', uid),
        this.supa.client.from('folders').select('id').eq('owner_id', uid)
      ]);
      this.totalFiles   = filesRes.data?.length || 0;
      this.totalFolders = foldersRes.data?.length || 0;
    } catch {}
  }

  async loadSharedWithMe(): Promise<void> {
    try {
      const [files, folders] = await Promise.all([
        this.fileSvc.getSharedFiles(),
        this.folderSvc.getSharedFolders()
      ]);
      this.sharedWithMe = [
        ...folders.map(f => ({ ...f, itemType: 'folder' as const })),
        ...files.map(f => ({ ...f, itemType: 'file' as const }))
      ];
    } catch { this.sharedWithMe = []; }
  }

  formatSize(bytes: number): string {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1048576).toFixed(1)} MB`;
  }

  fileExt(name: string): string {
    if (!name) return '—';
    const parts = name.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : '—';
  }

  isFolder(item: SharedItem): boolean {
    return item.itemType === 'folder';
  }

  navigateToFolder(item: SharedItem): void {
    this.router.navigate(['/files'], { queryParams: { folder: (item as any).id } });
  }

  dlModalFile: any  = null;
  dlLoadingOrig      = false;
  dlLoadingPdf       = false;
  dlPdfError         = '';

  openDlModal(file: any): void { this.dlModalFile = file; this.dlPdfError = ''; }
  closeDlModal(): void {
    this.dlModalFile  = null;
    this.dlLoadingOrig = false;
    this.dlLoadingPdf  = false;
    this.dlPdfError    = '';
  }

  async dlOriginal(): Promise<void> {
    if (!this.dlModalFile || this.dlLoadingOrig) return;
    this.dlLoadingOrig = true;
    this.cdr.detectChanges();
    try {
      const response = await fetch(this.dlModalFile.url);
      const blob = await response.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = this.dlModalFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objUrl), 3000);
    } catch {
      // Fallback: enlace directo
      const a = document.createElement('a');
      a.href = this.dlModalFile.url;
      a.download = this.dlModalFile.name;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    this.closeDlModal();
  }

  isOfficeDl(name: string): boolean {
    const ext = (name || '').split('.').pop()?.toLowerCase() || '';
    return ['docx','doc','xlsx','xls','pptx','ppt','odt','ods','odp'].includes(ext);
  }

  async dlAsPDF(): Promise<void> {
    if (!this.dlModalFile || this.dlLoadingPdf) return;
    this.dlLoadingPdf = true;
    this.dlPdfError   = '';
    this.cdr.detectChanges();
    try {
      const ext = (this.dlModalFile.name.split('.').pop() || 'docx').toLowerCase();
      const payload = {
        async: false, filetype: ext,
        key: Date.now().toString(),
        outputtype: 'pdf',
        title: this.dlModalFile.name,
        url: this.dlModalFile.url
      };
      const resp = await fetch(
        '/api/convert',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      const json = await resp.json();
      if (json.error && json.error !== 0) {
        const msgs: Record<number, string> = {
          '-1': 'Error desconocido al convertir.',
          '-2': 'Tiempo de espera agotado.',
          '-3': 'Error de conversión.',
          '-4': 'OnlyOffice no pudo descargar el archivo desde Supabase.',
          '-5': 'Contraseña incorrecta.',
          '-6': 'Error de acceso al archivo.',
          '-7': 'Formato de archivo incorrecto.',
          '-8': 'Invalid token.',
        };
        this.dlPdfError = msgs[json.error] || `Error de conversión (código ${json.error}).`;
        this.dlLoadingPdf = false;
      } else if (json.fileUrl) {
        // Reescribir la URL de OnlyOffice a través del proxy para evitar CORS
        const proxiedUrl = json.fileUrl.replace(/^https?:\/\/[^/]+/, '/oo-dl');
        const blobResp = await fetch(proxiedUrl);
        const blob = await blobResp.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = this.dlModalFile.name.replace(/\.[^.]+$/, '') + '.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(objUrl), 3000);
        this.closeDlModal();
      } else {
        this.dlPdfError = 'No se pudo convertir el archivo.';
        this.dlLoadingPdf = false;
      }
    } catch {
      this.dlPdfError = 'Error al conectar con el servidor de conversión. Asegúrate de que OnlyOffice esté en ejecución (puerto 8080).';
      this.dlLoadingPdf = false;
    }
    this.cdr.detectChanges();
  }

  async logout(): Promise<void> { await this.authSvc.logout(); }

  private _closeMenu = () => { this.menuOpen = false; this.cdr.detectChanges(); };

  toggleMenu(e: Event): void {
    e.stopPropagation();
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) {
      setTimeout(() => document.addEventListener('click', this._closeMenu, { once: true }), 0);
    }
  }

  getUserInitial(user: User | null): string {
    if (!user) return '?';
    const base = (user.displayName || user.email || '').trim();
    return base ? base.charAt(0).toUpperCase() : '?';
  }
}