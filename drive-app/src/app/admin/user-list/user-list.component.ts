import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserService } from '../../shared/Permission/services/user.service';
import { AuthService } from '../../shared/Permission/services/auth.service';
import { User } from '../../shared/models/model';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './user-list.component.html',
  styleUrls: ['./user-list.component.css']
})
export class UserListComponent implements OnInit, OnDestroy {
  users:         User[] = [];
  filteredUsers: User[] = [];
  loading      = true;
  search       = '';
  filterRole   = 'all';
  filterStatus = 'all';
  successMsg   = '';
  editingUser: User | null = null;

  menuOpen = false;

  toggleMenu(e: MouseEvent): void {
    e.stopPropagation();
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) document.addEventListener('click', this._closeMenu, { once: true });
  }

  private _closeMenu = () => {
    this.menuOpen = false;
    this.cdr.detectChanges();
  };

  ngOnDestroy(): void {
    document.removeEventListener('click', this._closeMenu);
  }
  editName   = '';

  constructor(
    private userSvc:  UserService,
    public  authSvc:  AuthService,
    private location: Location,
    private cdr:      ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    console.log('[UserList] Iniciando...');
    try {
      console.log('[UserList] Esperando authReady...');
      await this.authSvc.authReady;
      console.log('[UserList] Auth listo, verificando admin...');
      if (!this.authSvc.isAdmin()) {
        console.warn('[UserList] No es admin, logout');
        await this.authSvc.logout();
        return;
      }
      console.log('[UserList] Es admin, cargando usuarios...');
      await this.load();
    } catch (err) {
      console.error('[UserList] Error en ngOnInit:', err);
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async load(): Promise<void> {
    console.log('[UserList] load() iniciando...');
    this.loading = true;
    this.cdr.detectChanges();
    
    try {
      // Timeout de 8 segundos
      const users = await Promise.race([
        this.userSvc.getAllUsers(),
        new Promise((_,rej) => setTimeout(() => rej(new Error('Timeout cargando usuarios')), 8000))
      ]) as any;
      
      this.users = users;
      console.log('[UserList] Usuarios cargados:', this.users.length);
      this.filter();
    } catch (err: any) {
      console.error('[UserList] Error en load():', err?.message || err);
      alert(`Error cargando usuarios: ${err?.message || 'Error desconocido'}`);
    } finally {
      console.log('[UserList] Finalizando carga');
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  goBack(): void {                      // ✅ agregado
    this.location.back();
  }

  filter(): void {
    let list = [...this.users];
    if (this.filterRole   !== 'all') list = list.filter(u => u.role   === this.filterRole);
    if (this.filterStatus !== 'all') list = list.filter(u => u.active === (this.filterStatus === 'active'));
    const q = this.search.toLowerCase();
    if (q) list = list.filter(u =>
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q));
    this.filteredUsers = list;
  }

  async changeRole(user: User, event: any): Promise<void> {
    const role = (typeof event === 'string') ? event : event.target.value;
    if (!role || role === user.role) return;
    if (!confirm(`Cambiar rol de "${user.displayName}" a "${role === 'admin' ? 'Admin' : 'Usuario'}"?`)) {
      (event.target as HTMLSelectElement).value = user.role;
      return;
    }
    await this.userSvc.changeRole(user.uid, role as any);
    this.showSuccess(`Rol actualizado a ${role === 'admin' ? 'Admin' : 'Usuario'}.`);
    await this.load();
  }

  async changeState(user: User, event: any): Promise<void> {
    const state = event.target.value;
    if (!state) return;
    const newActive = state === 'active';
    if (newActive === user.active) return;
    const accion = newActive ? 'activar' : 'desactivar';
    if (!confirm(`¿${accion} a "${user.displayName}"?`)) {
      event.target.value = user.active ? 'active' : 'inactive';
      return;
    }
    await this.userSvc.toggleActive(user.uid, newActive);
    this.showSuccess(`Usuario ${newActive ? 'activado' : 'desactivado'}.`);
    await this.load();
  }

  async handleAction(action: string, user: User): Promise<void> {
    if (!action) return;
    if (action === 'edit') {
      this.openEdit(user);
    } else if (action === 'delete') {
      if (!confirm(`¿Eliminar a "${user.displayName}" permanentemente?`)) return;
      await this.userSvc.deleteUser(user.uid);
      this.showSuccess(`Usuario ${user.displayName} eliminado.`);
      await this.load();
    }
  }

  openEdit(user: User): void {
    this.editingUser = { ...user };
    this.editName    = user.displayName;
  }

  async saveEdit(): Promise<void> {
    if (!this.editingUser || !this.editName.trim()) return;
    await this.userSvc.updateDisplayName(this.editingUser.uid, this.editName.trim());
    this.showSuccess('Nombre actualizado.');
    this.editingUser = null;
    await this.load();
  }

  private showSuccess(msg: string): void {
    this.successMsg = msg;
    setTimeout(() => this.successMsg = '', 3500);
  }

  get totalAdmins():    number { return this.users.filter(u => u.role === 'admin').length; }
  get totalActivos():   number { return this.users.filter(u =>  u.active).length; }
  get totalInactivos(): number { return this.users.filter(u => !u.active).length; }
}