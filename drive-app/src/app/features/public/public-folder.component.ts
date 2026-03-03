import { Component, OnInit } from '@angular/core';
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

  constructor(
    private route: ActivatedRoute,
    private folderSvc: FolderService,
    private fileSvc: FileService
  ) {}

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token');

    if (!token) {
      this.errorMessage = 'Carpeta no encontrada';
      this.loading = false;
      return;
    }

    try {
      const data = await this.folderSvc.getPublicFolder(token);
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
      this.loading = false;
    }
  }

  formatSize(bytes: number): string {
    return this.fileSvc.formatSize(bytes);
  }

  getFileIcon(type: string): string {
    return this.fileSvc.getFileIcon(type);
  }

  downloadFile(file: PublicFileData): void {
    window.open(file.url, '_blank');
  }
}
