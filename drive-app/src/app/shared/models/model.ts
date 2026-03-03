// ── USER MODEL ───────────────────────────────────────
export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  active: boolean;
  createdAt: Date;
  photoURL?: string;
}

// ── FILE MODEL ───────────────────────────────────────
export interface DriveFile {
  id?: string;
  name: string;
  type: string;
  size: number;
  url: string;
  storagePath: string;
  publicId?: string;        // ← AGREGAR ESTA LÍNEA
  folderId: string | null;
  ownerId: string;
  sharedWith: SharedPermission[];
  publicLink?: string;
  publicLinkActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  isShared?: boolean;
  sharedPermission?: 'viewer' | 'editor';
}

// ── FOLDER MODEL ─────────────────────────────────────
export interface Folder {
  id?: string;
  name: string;
  parentId: string | null;
  ownerId: string;
  sharedWith: string[];
  createdAt: Date;
  isShared?: boolean;
  sharedPermission?: 'viewer' | 'editor';
}

// ── ITEM COMPARTIDO (archivo o carpeta) ───────────────
export type SharedItem =
  | (DriveFile & { itemType: 'file' })
  | (Folder   & { itemType: 'folder' });

// ── PERMISO DE COMPARTIR ─────────────────────────────
export interface SharedPermission {
  uid: string;
  email: string;
  permission: 'view' | 'download' | 'edit';
  sharedAt: Date;
}

// ── LINK PÚBLICO ─────────────────────────────────────
export interface ShareLink {
  id?: string;
  fileId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  createdBy: string;
  createdAt: Date;
  expiresAt?: Date;
  active: boolean;
  accessCount: number;
  hasPassword?: boolean;
  passwordHash?: string;
}

// ── SESIÓN DE INICIO (para logs históricos) ─────────
export interface SessionLog {
  id?: string;
  uid: string;
  email: string;
  displayName: string;
  loginAt: Date;
  ip?: string;
  userAgent?: string;
  success: boolean;
}

// ── SESIÓN ACTIVA (para auditoría en tiempo real) ───
export interface ActiveSession {
  id?: string;
  user_id: string;
  email: string;
  displayName: string;
  login_at: Date;
  last_seen: Date;
  user_agent: string;
  ip_address?: string;
  active: boolean;
  session_id: string;  // ID de sesión de Supabase Auth
}