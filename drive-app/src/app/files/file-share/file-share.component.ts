import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ShareService } from '../../shared/Permission/services/share.service';
import { ShareLink } from '../../shared/models/model';

@Component({
  selector: 'app-file-share',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-share.component.html',
  styleUrls: ['./file-share.component.css']
})
export class FileShareComponent implements OnInit {
  link:    ShareLink | null = null;
  loading = true;
  error   = '';

  constructor(
    private route:    ActivatedRoute,
    private shareSvc: ShareService
  ) {}

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error   = 'Link inválido.';
      this.loading = false;
      return;
    }
    try {
      this.link = await this.shareSvc.getLinkData(id);
      if (!this.link)             this.error = 'Este link no existe.';
      else if (!this.link.active) this.error = 'Este link fue desactivado por el dueño.';
    } catch {
      this.error = 'Error al cargar el archivo.';
    } finally {
      this.loading = false;
    }
  }

  formatSize(bytes: number): string {
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  getIcon(type: string): string {
    if (type.includes('image'))  return '🖼️';
    if (type.includes('pdf'))    return '📄';
    if (type.includes('video'))  return '🎬';
    if (type.includes('audio'))  return '🎵';
    if (type.includes('zip'))    return '📦';
    if (type.includes('sheet') || type.includes('excel')) return '📊';
    if (type.includes('word'))   return '📝';
    return '📁';
  }
}