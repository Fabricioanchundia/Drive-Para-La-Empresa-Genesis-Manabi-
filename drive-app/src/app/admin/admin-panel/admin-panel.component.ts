import { Component, OnInit, OnDestroy, Pipe, PipeTransform, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../shared/Permission/services/auth.service';
import { SupabaseService } from '../../shared/Permission/services/supabase.service';
import { User } from '../../shared/models/model';
import { FileService } from '../../shared/Permission/services/file.service';

@Pipe({ name: 'adminCount', standalone: true })
export class AdminCountPipe implements PipeTransform {
  transform(users: User[]): number { return users.filter(u => u.role === 'admin').length; }
}
@Pipe({ name: 'activeCount', standalone: true })
export class ActiveCountPipe implements PipeTransform {
  transform(users: User[]): number { return users.filter(u => u.active).length; }
}

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [CommonModule, RouterLink, AdminCountPipe, ActiveCountPipe],
  templateUrl: './admin-panel.component.html',
  styleUrls: ['./admin-panel.component.css']
})
export class AdminPanelComponent implements OnInit, OnDestroy {
  users:        User[] = [];
  loading       = true;
  admin:        User | null = null;
  sharedWithMe: any[] = [];
  private loadStarted = false;
  private sub?: Subscription;

  constructor(
    public  authSvc: AuthService,
    private supa:    SupabaseService,
    private router:  Router,
    private cdr:     ChangeDetectorRef,
    private fileSvc: FileService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.authSvc.authReady;
    this.loadStarted = false;
    this.loading = true;
    this.cdr.detectChanges();

    let user = this.authSvc.currentUser;
    if (!user) {
      user = await this.authSvc.refreshCurrentUserFromSession();
    }

    if (user && user.role === 'admin') {
      this.admin = user;
      this.cdr.detectChanges();
      await Promise.all([this.loadUsers(), this.loadSharedWithMe()]);
      return;
    }

    if (user && user.role !== 'admin') {
      this.loading = false;
      this.cdr.detectChanges();
      this.router.navigate(['/dashboard']);
      return;
    }

    this.sub = this.authSvc.currentUser$.subscribe(async (current) => {
      if (!current || !current.uid) return;
      if (current.role !== 'admin') {
        this.loading = false;
        this.cdr.detectChanges();
        this.router.navigate(['/dashboard']);
        this.sub?.unsubscribe();
        return;
      }
      this.admin = current;
      this.cdr.detectChanges();
      await Promise.all([this.loadUsers(), this.loadSharedWithMe()]);
      this.sub?.unsubscribe();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  async loadSharedWithMe(): Promise<void> {
    try {
      this.sharedWithMe = await this.fileSvc.getSharedFiles();
      this.cdr.detectChanges();
    } catch { this.sharedWithMe = []; }
  }

  dlModalFile: any  = null;
  dlLoadingOrig      = false;
  dlLoadingPdf       = false;
  dlPdfError         = '';

  openDlModal(file: any): void { this.dlModalFile = file; this.dlPdfError = ''; }
  closeDlModal(): void {
    this.dlModalFile   = null;
    this.dlLoadingOrig = false;
    this.dlLoadingPdf  = false;
    this.dlPdfError    = '';
  }

  async dlOriginal(): Promise<void> {
    if (!this.dlModalFile || this.dlLoadingOrig) return;
    const a = document.createElement('a');
    a.href = this.dlModalFile.url;
    a.download = this.dlModalFile.name;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
      if (json.fileUrl) {
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
      this.dlPdfError = 'Error al conectar con el servidor de conversión.';
      this.dlLoadingPdf = false;
    }
    this.cdr.detectChanges();
  }

  formatSize(bytes: number): string {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  private async loadUsers(): Promise<void> {
    if (this.loadStarted) return;
    this.loadStarted = true;
    this.loading = true;
    this.cdr.detectChanges();

    let fallbackId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      this.loading = false;
      this.cdr.detectChanges();
      fallbackId = null;
    }, 5000);

    try {
      const { data, error } = await this.supa.client
        .from('users')
        .select('id,email,display_name,role,active,created_at')
        .order('created_at', { ascending: false });

      if (error || !data) {
        this.users = [];
      } else {
        this.users = data.map((d: any) => ({
          uid:         d.id,
          email:       d.email,
          displayName: d.display_name || d.email.split('@')[0],
          role:        d.role,
          active:      d.active,
          createdAt:   new Date(d.created_at)
        }));
      }
    } catch (e) {
      this.users = [];
    } finally {
      if (fallbackId) clearTimeout(fallbackId);
      this.loading = false;
      this.cdr.detectChanges();
    }
  }
}