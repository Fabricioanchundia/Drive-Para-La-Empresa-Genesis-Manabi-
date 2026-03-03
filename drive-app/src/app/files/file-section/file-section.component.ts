import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DriveFile } from '../../shared/models/model';
import { FileService } from '../../shared/Permission/services/file.service';
import { ShareService } from '../../shared/Permission/services/share.service';

@Component({
  selector: 'app-file-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './file-section.component.html',
  styleUrls: ['./file-section.component.css']
})
export class FileSectionComponent {
  @Input() files: DriveFile[] = [];
  @Input() loading = false;
  @Output() fileDelete = new EventEmitter<DriveFile>();
  @Output() fileDownload = new EventEmitter<DriveFile>();
  @Output() fileShare = new EventEmitter<DriveFile>();

  filterText = '';
  filterType = 'all';
  filterStatus = 'all';
  filterDate = 'all';
  
  actionMenuFileId: string | null = null;
  sharingFileId: string | null = null;
  generatedFileLink = '';
  generatingLink = false;
  linkCopied = false;
  shareNotification = { show: false, message: '' };

  constructor(
    private readonly router: Router,
    private readonly fileSvc: FileService,
    private readonly shareSvc: ShareService
  ) {}

  get filteredFiles(): DriveFile[] {
    let result = [...this.files];

    // Filter by text
    if (this.filterText.trim()) {
      const search = this.filterText.toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(search));
    }

    // Filter by type
    if (this.filterType !== 'all') {
      result = result.filter(f => {
        const type = f.type.toLowerCase();
        switch (this.filterType) {
          case 'image': return type.includes('image');
          case 'pdf': return type.includes('pdf');
          case 'document': return type.includes('document') || type.includes('word');
          case 'video': return type.includes('video');
          default: return true;
        }
      });
    }

    // Filter by status
    if (this.filterStatus !== 'all') {
      result = result.filter(f => {
        if (this.filterStatus === 'public') return f.publicLinkActive;
        if (this.filterStatus === 'private') return !f.publicLinkActive;
        return true;
      });
    }

    // Sort by date
    if (this.filterDate === 'newest') {
      result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } else if (this.filterDate === 'oldest') {
      result.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    return result;
  }

  toggleActionMenu(fileId: string, event: Event): void {
    event.stopPropagation();
    this.actionMenuFileId = this.actionMenuFileId === fileId ? null : fileId;
  }

  closeActionMenu(): void {
    this.actionMenuFileId = null;
  }

  async shareFile(file: DriveFile, event: Event): Promise<void> {
    event.stopPropagation();
    this.closeActionMenu();
    this.linkCopied = false;
    this.generatedFileLink = '';
    this.generatingLink = true;

    // Abrir modal de inmediato para que el usuario vea feedback
    this.sharingFileId = file.id!;

    try {
      // Si ya tiene link activo y token, reusar directamente sin llamar a Supabase
      if (file.publicLinkActive && file.publicId) {
        const baseUrl = this.shareSvc.getPublicAppBaseUrl();
        this.generatedFileLink = `${baseUrl}/public/${file.publicId}`;
      } else {
        const result = await this.shareSvc.generatePublicLinkFile(file.id!);
        if (result && result.link) {
          this.generatedFileLink = result.link;
          const token = result.link.split('/').pop() || '';
          if (token) file.publicId = token;
          file.publicLinkActive = true;
        } else {
          this.generatedFileLink = '';
        }
      }
    } catch (err) {
      console.error('Error generando link de archivo:', err);
      this.generatedFileLink = '';
    } finally {
      this.generatingLink = false;
    }
  }

  private async autoCopyLink(link: string): Promise<void> {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(link);
        console.log('Link copiado automáticamente al portapapeles');
      } catch (err) {
        console.error('Error copiando al portapapeles:', err);
        this.fallbackCopyToClipboard(link);
      }
    } else {
      this.fallbackCopyToClipboard(link);
    }
  }

  editFile(file: DriveFile, event: Event): void {
    event.stopPropagation();
    this.closeActionMenu();
    this.router.navigate(['/edit', file.id]);
  }

  canEditFile(file: DriveFile): boolean {
    if (file.isShared && file.sharedPermission !== 'editor') {
      return false;
    }

    return true;
  }

  copyFileLink(): void {
    if (!this.generatedFileLink) {
      console.error('No hay link para copiar');
      return;
    }

    // Método moderno: Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(this.generatedFileLink)
        .then(() => {
          console.log('Link copiado al portapapeles');
          this.linkCopied = true;
          setTimeout(() => {
            this.linkCopied = false;
          }, 2000);
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

  private fallbackCopyToClipboard(link?: string): void {
    const textToCopy = link || this.generatedFileLink;
    if (!textToCopy) return;

    const textarea = document.createElement('textarea');
    textarea.value = textToCopy;
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
      }, 2000);
    } catch (err) {
      console.error('Error al copiar:', err);
    } finally {
      document.body.removeChild(textarea);
    }
  }

  async deactivateFileLink(fileId: string): Promise<void> {
    try {
      await this.shareSvc.deactivatePublicLinkFile(fileId);
      const file = this.files.find(f => f.id === fileId);
      if (file) {
        file.publicLinkActive = false;
      }
      this.closeSharingModal();
    } catch (err) {
      console.error('Error desactivando link de archivo:', err);
    }
  }

  closeSharingModal(): void {
    this.sharingFileId = null;
    this.generatedFileLink = '';
    this.generatingLink = false;
    this.linkCopied = false;
  }

  downloadFile(file: DriveFile, event: Event): void {
    event.stopPropagation();
    this.fileDownload.emit(file);
    this.closeActionMenu();
  }

  deleteFile(file: DriveFile, event: Event): void {
    event.stopPropagation();
    if (confirm(`¿Eliminar "${file.name}"?`)) {
      this.fileDelete.emit(file);
    }
    this.closeActionMenu();
  }

  shareByEmail(file: DriveFile, event: Event): void {
    event.stopPropagation();
    this.fileShare.emit(file);
    this.closeActionMenu();
  }

  formatSize(bytes: number): string {
    return this.fileSvc.formatSize(bytes);
  }

  getFileIcon(type: string): string {
    return this.fileSvc.getFileIcon(type);
  }
}
