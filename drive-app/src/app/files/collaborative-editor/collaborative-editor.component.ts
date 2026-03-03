import { Component, OnInit, OnDestroy, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../shared/Permission/services/auth.service';
import { CollaborativeEditService, ActiveEditor } from '../../shared/Permission/services/collaborative-edit.service';

@Component({
  selector: 'app-collaborative-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="editor-container">
      <!-- Barra de usuarios activos -->
      <div class="active-editors">
        <div class="editor-info">
          <span class="label">Editando:</span>
          <div class="editors-list">
            <div *ngFor="let editor of activeEditors" 
                 class="editor-badge" 
                 [style.backgroundColor]="editor.color">
              {{ editor.user_name }}
            </div>
          </div>
        </div>
      </div>

      <!-- Editor de texto -->
      <div class="editor-wrapper">
        <textarea 
          class="editor"
          [(ngModel)]="content"
          (input)="onContentChange()"
          (selectionchange)="onCursorChange()"
          (keyup)="onCursorChange()"
          placeholder="Comienza a escribir...">
        </textarea>

        <!-- Cursores remotos -->
        <div class="remote-cursors">
          <div *ngFor="let editor of activeEditors"
               class="remote-cursor"
               [style.top.px]="editor.cursor_position * 20"
               [style.borderColor]="editor.color">
            <span class="cursor-label">{{ editor.user_name }}</span>
          </div>
        </div>
      </div>

      <!-- Estado de sincronización -->
      <div class="sync-status">
        <span *ngIf="isSyncing" class="syncing">Sincronizando...</span>
        <span *ngIf="!isSyncing && lastSyncTime" class="synced">
          Sincronizado hace {{ getTimeAgo(lastSyncTime) }}
        </span>
      </div>
    </div>
  `,
  styles: [`
    .editor-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      border: 1px solid #dce8f5;
      border-radius: 8px;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
    }

    .active-editors {
      padding: 12px 16px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .editor-info {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .label {
      font-size: 12px;
      color: #6b7280;
      font-weight: 600;
      text-transform: uppercase;
    }

    .editors-list {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .editor-badge {
      padding: 4px 12px;
      border-radius: 20px;
      color: white;
      font-size: 12px;
      font-weight: 600;
    }

    .editor-wrapper {
      flex: 1;
      overflow: hidden;
      position: relative;
    }

    .editor {
      width: 100%;
      height: 100%;
      border: none;
      padding: 16px;
      font-size: 14px;
      font-family: 'Courier New', monospace;
      resize: none;
      outline: none;
      background: white;
      color: #1a3a6b;
    }

    .remote-cursors {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      pointer-events: none;
    }

    .remote-cursor {
      position: absolute;
      width: 3px;
      height: 20px;
      border-left: 3px solid #1a3a6b;
      animation: blink 1s infinite;
      display: flex;
      align-items: center;
      margin-left: 8px;
    }

    .cursor-label {
      font-size: 10px;
      color: white;
      background: #1a3a6b;
      padding: 2px 6px;
      border-radius: 2px;
      white-space: nowrap;
      margin-left: 8px;
      opacity: 0.8;
    }

    @keyframes blink {
      0%, 50%, 100% { opacity: 1; }
      25%, 75% { opacity: 0.5; }
    }

    .sync-status {
      padding: 8px 16px;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
      text-align: right;
    }

    .syncing {
      color: #f59e0b;
      font-weight: 600;
    }

    .synced {
      color: #10b981;
    }
  `]
})
export class CollaborativeEditorComponent implements OnInit, OnDestroy {
  @Input() fileId: string = '';
  
  private readonly authSvc = inject(AuthService);
  private readonly collabSvc = inject(CollaborativeEditService);

  content = '';
  activeEditors: ActiveEditor[] = [];
  isSyncing = false;
  lastSyncTime: Date | null = null;
  
  private syncInterval: any = null;

  ngOnInit(): void {
    if (!this.fileId) return;

    const user = this.authSvc.currentUser;
    if (!user) return;

    // Iniciar colaboración
    this.collabSvc.startCollaboration(
      this.fileId,
      user.uid,
      user.displayName
    );

    // Suscribirse a cambios
    this.collabSvc.changes$.subscribe(() => {
      this.loadDocumentContent();
    });

    // Cargar contenido inicial
    this.loadDocumentContent();

    // Actualizar editores activos cada 5 segundos
    this.syncInterval = setInterval(() => {
      this.loadActiveEditors();
    }, 5000);
  }

  ngOnDestroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.collabSvc.stopCollaboration();
  }

  private async loadDocumentContent(): Promise<void> {
    await this.collabSvc.applyAllChanges(this.fileId);
    // Aquí podrías reconstruir el contenido desde los deltas
    // Por ahora solo sincronizamos cambios
  }

  private async loadActiveEditors(): Promise<void> {
    this.activeEditors = await this.collabSvc.getActiveEditors(this.fileId);
  }

  async onContentChange(): Promise<void> {
    const user = this.authSvc.currentUser;
    if (!user) return;

    this.isSyncing = true;

    try {
      // Crear delta format (similar a Quill)
      const contentDelta = {
        ops: [{ insert: this.content }]
      };

      await this.collabSvc.saveChange(
        this.fileId,
        user.uid,
        user.displayName,
        contentDelta,
        this.content.length
      );

      this.lastSyncTime = new Date();
    } catch (err) {
      console.error('Error saving change:', err);
    } finally {
      this.isSyncing = false;
    }
  }

  onCursorChange(): void {
    // Aquí podrías guardar la posición del cursor
    // y compartirla con otros editores en tiempo real
  }

  getTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'hace poco';
    if (seconds < 3600) return `hace ${Math.floor(seconds / 60)}m`;
    return `hace ${Math.floor(seconds / 3600)}h`;
  }
}
