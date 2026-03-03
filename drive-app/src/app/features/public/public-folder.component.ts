import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FolderService } from '../../shared/Permission/services/folder.service';
import { FileService } from '../../shared/Permission/services/file.service';

type PublicFolderData = {
  id: string;
  name: string;
  owner_id: string;
};

type PublicFileData = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
};

@Component({
  selector: 'app-public-folder',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './public-folder.component.html',
  styleUrls: ['./public-folder.component.css']
})
export class PublicFolderComponent implements OnInit {
  loading = true;
  folder: PublicFolderData | null = null;
  files: PublicFileData[] = [];
  errorMessage = '';
  token = '';
  downloadingZip = false;

  constructor(
    private route: ActivatedRoute,
    private folderSvc: FolderService,
    private fileSvc: FileService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token') || '';

    if (!this.token) {
      this.errorMessage = 'Carpeta no encontrada';
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    const safetyTimer = setTimeout(() => {
      if (this.loading) {
        this.loading = false;
        this.errorMessage = 'No se pudo cargar la carpeta. ¿El servidor backend está corriendo?';
        this.cdr.detectChanges();
      }
    }, 10000);

    try {
      const data = await this.folderSvc.getPublicFolder(this.token);
      if (!data) {
        this.errorMessage = 'Carpeta no encontrada o link desactivado';
        return;
      }

      this.folder = data.folder;
      this.files = data.files;
    } catch (err) {
      console.error('Error cargando carpeta publica:', err);
      this.errorMessage = 'Error al cargar la carpeta';
    } finally {
      clearTimeout(safetyTimer);
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  downloadZip(): void {
    if (!this.token || this.files.length === 0) return;
    this.downloadingZip = true;
    this.cdr.detectChanges();

    const zipUrl = this.folderSvc.getPublicFolderZipUrl(this.token);
    const a = document.createElement('a');
    a.href = zipUrl;
    a.download = `${this.folder?.name ?? 'carpeta'}.zip`;
    a.click();

    // Dar tiempo al navegador para iniciar la descarga
    setTimeout(() => {
      this.downloadingZip = false;
      this.cdr.detectChanges();
    }, 3000);
  }

  downloadFile(file: PublicFileData): void {
    const a = document.createElement('a');
    a.href = file.url;
    a.target = '_blank';
    a.download = file.name;
    a.click();
  }

  formatSize(bytes: number): string {
    return this.fileSvc.formatSize(bytes);
  }

  getFileIcon(type: string): string {
    return this.fileSvc.getFileIcon(type);
  }

  getFileCategory(type: string): string {
    const t = type?.toLowerCase() || '';
    if (t.includes('pdf'))                                                return 'pdf';
    if (t.includes('image'))                                              return 'image';
    if (t.includes('video'))                                              return 'video';
    if (t.includes('audio'))                                              return 'audio';
    if (t.includes('zip') || t.includes('rar') || t.includes('7z'))      return 'zip';
    if (t.includes('sheet') || t.includes('excel') || t.includes('csv')) return 'excel';
    if (t.includes('presentation') || t.includes('powerpoint'))          return 'powerpoint';
    if (t.includes('word') || t.includes('document'))                    return 'word';
    if (t.includes('text') || t.includes('plain') || t.includes('json') || t.includes('xml')) return 'text';
    return 'file';
  }
}
