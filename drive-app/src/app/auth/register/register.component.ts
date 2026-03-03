import { Component, ChangeDetectorRef } from '@angular/core';
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

  showPassword = false;
  showConfirm  = false;

  emailTouched    = false;
  confirmTouched  = false;

  get emailValid(): boolean {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(this.email);
  }

  get passwordsMatch(): boolean {
    return this.password === this.confirm;
  }

  constructor(private authSvc: AuthService, private cdr: ChangeDetectorRef) {}

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
      const map: Record<string, string> = {
        'auth/email-already-in-use':  'Este correo ya está registrado.',
        'auth/invalid-email':         'El formato del correo no es válido.',
        'auth/weak-password':         'La contraseña es muy débil. Usa letras mayúsculas, números y símbolos.',
        'auth/email-not-confirmed':   'Debes confirmar tu correo antes de iniciar sesión.',
        'auth/signup-disabled':       'El registro está deshabilitado. Contacta al administrador.',
        'auth/too-many-requests':     'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
      };
      this.errorMsg = map[err.code]
        || (err.rawMessage ? `Error: ${err.rawMessage}` : null)
        || 'No se pudo crear la cuenta. Intenta con otro correo o contraseña más compleja.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }
}