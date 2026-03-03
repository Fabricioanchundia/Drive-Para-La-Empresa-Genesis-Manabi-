import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Folder } from '../../shared/models/model';
import { ShareService } from '../../shared/Permission/services/share.service';

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
  @Output() folderClick = new EventEmitter<string>();
  @Output() folderDelete = new EventEmitter<string>();

  filterText = '';
  actionMenuFolderId: string | null = null;
  sharingFolderId: string | null = null;
  generatedFolderLink = '';
  linkCopied = false;

  constructor(private shareSvc: ShareService) {}

  get filteredFolders(): Folder[] {
    if (!this.filterText.trim()) return this.folders;
    const search = this.filterText.toLowerCase();
    return this.folders.filter(f => f.name.toLowerCase().includes(search));
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

    try {
      // Generar link ANTES de abrir el modal
      this.generatedFolderLink = await this.shareSvc.generatePublicLinkFolder(folder.id!);
    } catch (err) {
      console.error('Error generando link de carpeta:', err);
      this.generatedFolderLink = 'Error al generar el link';
    }

    // Abrir modal SOLO cuando el link ya está listo
    this.sharingFolderId = folder.id!;
  }

  shareFolderByEmailModal(folder: Folder, event: Event): void {
    event.stopPropagation();
    this.closeActionMenu();
    const email = prompt('Ingresa el correo electrónico del usuario:');
    if (email && email.trim()) {
      this.shareFolderByEmailPrompt(folder.id!, email.trim());
    }
  }

  async shareFolderByEmailPrompt(folderId: string, email: string): Promise<void> {
    try {
      // TODO: Implementar shareservice.shareFolderByEmail
      console.log('Compartir carpeta', folderId, 'con', email);
      alert('Invitación enviada a ' + email + ' (función pendiente de implementar)');
    } catch (err) {
      console.error('Error compartiendo carpeta:', err);
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
}
