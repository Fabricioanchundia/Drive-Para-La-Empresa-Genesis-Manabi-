import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [

  { path: '', redirectTo: '/login', pathMatch: 'full' },

  // ── PÚBLICAS ──────────────────────────────────────────
  {
    path: 'login',
    loadComponent: () =>
      import('./auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./auth/register/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'share/:id',
    loadComponent: () =>
      import('./files/file-share/file-share.component').then(m => m.FileShareComponent)
  },
  {
    path: 'public/:token',
    loadComponent: () =>
      import('./features/public/public-file.component').then(m => m.PublicFileComponent)
  },
  {
    path: 'public-folder/:token',
    loadComponent: () =>
      import('./features/public/public-folder.component').then(m => m.PublicFolderComponent)
  },

  // ── PRIVADAS ──────────────────────────────────────────
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'files',
    loadComponent: () =>
      import('./files/file-list/file-list.component').then(m => m.FileListComponent),
    canActivate: [authGuard]
  },
  {
    path: 'edit/:fileId',
    loadComponent: () =>
      import('./files/file-editor/file-editor.component').then(m => m.FileEditorComponent),
    canActivate: [authGuard]
  },

  // ── ADMIN (el guard verifica rol admin) ───────────────
  {
    path: 'admin',
    loadComponent: () =>
      import('./admin/admin-panel/admin-panel.component').then(m => m.AdminPanelComponent),
    canActivate: [authGuard]
  },
  {
    path: 'admin/users',
    loadComponent: () =>
      import('./admin/user-list/user-list.component').then(m => m.UserListComponent),
    canActivate: [authGuard]
  },
  {
    path: 'admin/sessions',
    loadComponent: () =>
      import('./admin/session-log/session-log.component').then(m => m.SessionLogComponent),
    canActivate: [authGuard]
  },
  {
    path: 'admin/debug-cookies',
    loadComponent: () =>
      import('./admin/debug-cookies/debug-cookies.component').then(m => m.DebugCookiesComponent),
    canActivate: [authGuard]
  },

  { path: '**', redirectTo: '/login' }
];