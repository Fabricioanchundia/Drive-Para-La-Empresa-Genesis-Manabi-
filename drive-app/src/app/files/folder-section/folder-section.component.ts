import { Component, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Folder } from '../../shared/models/model';
import { ShareService } from '../../shared/Permission/services/share.service';
import { EmailService } from '../../shared/Permission/services/email.service';
import { AuthService } from '../../shared/Permission/services/auth.service';

@Component({
  selector: 'app-folder-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './folder-section.component.html',
  styleUrls: ['./folder-section.component.css']
})
export class FolderSectionComponent {
  @Input() folders: Folder[] = [];
  @Input() loading = false;
  @Output() folderClick   = new EventEmitter<string>();
  @Output() folderDelete  = new EventEmitter<string>();
  @Output() folderRename  = new EventEmitter<{ id: string; name: string }>();

  filterText = '';
  filterType: 'all' | 'root' | 'sub' = 'all';
  filterStatus: 'all' | 'mine' | 'shared' = 'all';
  sortMode: 'none' | 'az' | 'za' | 'newest' | 'oldest' = 'none';
  actionMenuFolderId: string | null = null;
  sharingFolderId: string | null = null;
  generatedFolderLink = '';
  isGeneratingLink = false;
  linkCopied = false;

  // Email modal
  showEmailModal = false;
  emailModalFolder: Folder | null = null;
  emailInput = '';
  emailPermission: 'viewer' | 'editor' = 'viewer';
  emailSending = false;
  emailSent = false;
  emailError = '';

  // Rename modal
  renamingFolder: Folder | null = null;
  renameValue = '';
  renameSaving = false;

  constructor(
    private shareSvc: ShareService,
    private emailSvc: EmailService,
    private authSvc: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  get filteredFolders(): Folder[] {
    let result = [...this.folders];

    // Filtro por texto
    if (this.filterText.trim()) {
      const search = this.filterText.toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(search));
    }

    // Filtro por tipo (raíz vs subcarpeta)
    if (this.filterType === 'root') {
      result = result.filter(f => f.parentId === null);
    } else if (this.filterType === 'sub') {
      result = result.filter(f => f.parentId !== null);
    }

    // Filtro por estado (compartida o no)
    if (this.filterStatus === 'mine') {
      result = result.filter(f => !f.sharedWith || f.sharedWith.length === 0);
    } else if (this.filterStatus === 'shared') {
      result = result.filter(f => f.sharedWith && f.sharedWith.length > 0);
    }

    // Ordenación
    switch (this.sortMode) {
      case 'az':
        result = [...result].sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'za':
        result = [...result].sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'newest':
        result = [...result].sort((a, b) =>
          new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
        break;
      case 'oldest':
        result = [...result].sort((a, b) =>
          new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
        break;
    }

    return result;
  }

  toggleActionMenu(folderId: string, event: Event): void {
    event.stopPropagation();
    this.actionMenuFolderId = this.actionMenuFolderId === folderId ? null : folderId;
  }

  closeActionMenu(): void {
    this.actionMenuFolderId = null;
  }

  async shareFolder(folder: Folder, event: Event): Promise<void> {
    event.stopPropagation();
    this.closeActionMenu();
    this.linkCopied = false;
    this.generatedFolderLink = '';
    this.isGeneratingLink = true;
    this.sharingFolderId = folder.id!;   // abrir modal YA con spinner

    try {
      this.generatedFolderLink = await this.shareSvc.generatePublicLinkFolder(folder.id!);
    } catch (err) {
      console.error('Error generando link de carpeta:', err);
      this.generatedFolderLink = 'error';
    } finally {
      this.isGeneratingLink = false;
      this.cdr.detectChanges();
    }
  }

  shareFolderByEmailModal(folder: Folder, event: Event): void {
    event.stopPropagation();
    this.closeActionMenu();
    this.emailModalFolder = folder;
    this.emailInput = '';
    this.emailPermission = 'viewer';
    this.emailSending = false;
    this.emailSent = false;
    this.emailError = '';
    this.showEmailModal = true;
  }

  closeEmailModal(): void {
    this.showEmailModal = false;
    this.emailModalFolder = null;
    this.emailInput = '';
    this.emailPermission = 'viewer';
    this.emailSent = false;
    this.emailError = '';
  }

  async sendFolderEmail(): Promise<void> {
    if (!this.emailInput.trim() || !this.emailModalFolder) return;
    this.emailSending = true;
    this.emailError = '';
    try {
      const user = this.authSvc.currentUser;
      const senderName = user?.displayName ?? user?.email ?? 'Un usuario';

      // 1) Guardar permiso en la tabla permissions (para que aparezca en "Compartido conmigo")
      const permOk = await this.shareSvc.shareFolderByEmail(
        this.emailInput.trim(),
        this.emailModalFolder.id!,
        this.emailPermission
      );
      if (!permOk) {
        this.emailError = 'Usuario no encontrado o no se pudo guardar el permiso. Verifica el correo e intenta de nuevo.';
        this.emailSending = false;
        this.cdr.detectChanges();
        return;
      }

      // 2) Generar / reusar link público para enviar por correo
      let link = this.generatedFolderLink;
      if (!link || link === 'error') {
        link = await this.shareSvc.generatePublicLinkFolder(this.emailModalFolder.id!);
      }

      // 3) Enviar email con la invitación
      const ok = await this.emailSvc.sendShareInvitation(
        this.emailInput.trim(),
        this.emailModalFolder.name,
        link,
        senderName,
        this.emailPermission
      );

      if (ok) {
        this.emailSent = true;
        this.cdr.detectChanges();
        setTimeout(() => { this.closeEmailModal(); this.cdr.detectChanges(); }, 2500);
      } else {
        // Permiso guardado, pero el email fallo (no es crítico)
        this.emailSent = true;
        this.cdr.detectChanges();
        setTimeout(() => { this.closeEmailModal(); this.cdr.detectChanges(); }, 2500);
      }
    } catch {
      this.emailError = 'Error al compartir. Verifica el correo e intenta de nuevo.';
    } finally {
      this.emailSending = false;
      this.cdr.detectChanges();
    }
  }

  copyFolderLink(): void {
    if (!this.generatedFolderLink) {
      console.error('No hay link para copiar');
      return;
    }

    // Método moderno: Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(this.generatedFolderLink)
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

  private fallbackCopyToClipboard(): void {
    if (!this.generatedFolderLink) return;

    const textarea = document.createElement('textarea');
    textarea.value = this.generatedFolderLink;
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

  async deactivateFolderLink(folderId: string): Promise<void> {
    try {
      await this.shareSvc.deactivatePublicLinkFolder(folderId);
      this.closeSharingModal();
    } catch (err) {
      console.error('Error desactivando link de carpeta:', err);
    }
  }

  closeSharingModal(): void {
    this.sharingFolderId = null;
    this.generatedFolderLink = '';
    this.linkCopied = false;
  }

  openFolder(folderId: string): void {
    this.folderClick.emit(folderId);
  }

  deleteFolder(folderId: string, event: Event): void {
    event.stopPropagation();
    if (confirm('¿Eliminar esta carpeta?')) {
      this.folderDelete.emit(folderId);
    }
    this.closeActionMenu();
  }

  openRenameModal(folder: Folder, event: Event): void {
    event.stopPropagation();
    this.closeActionMenu();
    this.renamingFolder = folder;
    this.renameValue = folder.name;
    this.renameSaving = false;
  }

  closeRenameModal(): void {
    this.renamingFolder = null;
    this.renameValue = '';
    this.renameSaving = false;
  }

  confirmRename(): void {
    const name = this.renameValue.trim();
    if (!name || !this.renamingFolder || this.renameSaving) return;
    this.folderRename.emit({ id: this.renamingFolder.id!, name });
    // Actualizar localmente (el padre también puede actualizarlo)
    this.renamingFolder.name = name;
    this.closeRenameModal();
  }
}
