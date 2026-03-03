import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../shared/Permission/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent {
  name     = '';
  email    = '';
  password = '';
  confirm  = '';
  loading  = false;
  errorMsg = '';

  constructor(private authSvc: AuthService) {}

  async register(): Promise<void> {
    if (!this.name || !this.email || !this.password) {
      this.errorMsg = 'Completa todos los campos.'; return;
    }
    if (this.password !== this.confirm) {
      this.errorMsg = 'Las contraseñas no coinciden.'; return;
    }
    if (this.password.length < 6) {
      this.errorMsg = 'La contraseña debe tener al menos 6 caracteres.'; return;
    }
    this.loading = true; this.errorMsg = '';
    try {
      await this.authSvc.register(this.email, this.password, this.name);
    } catch (err: any) {
      const map: Record<string,string> = {
        'auth/email-already-in-use': 'Este correo ya está registrado.',
        'auth/invalid-email':        'Correo inválido.',
        'auth/weak-password':        'Contraseña muy débil.'
      };
      this.errorMsg = map[err.code] || 'Error al registrarse.';
    } finally {
      this.loading = false;
    }
  }
}