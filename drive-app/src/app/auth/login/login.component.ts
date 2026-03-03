import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../shared/Permission/services/auth.service';
import { SessionService } from '../../shared/Permission/services/session.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit, OnDestroy {
  private readonly router     = inject(Router);
  private readonly sessionSvc = inject(SessionService);
  private readonly cdr        = inject(ChangeDetectorRef);
  private sub?: Subscription;
  private authReady = false;
  private checkingTimeout?: ReturnType<typeof setTimeout>;

  email    = '';
  password = '';
  loading  = false;
  errorMsg = '';
  authChecking = true;

  constructor(private readonly authSvc: AuthService) {}

  ngOnInit(): void {
    this.sub = new Subscription();

    // Timeout de seguridad incondicional - SIEMPRE desbloquea en 2 segundos
    this.checkingTimeout = setTimeout(() => {
      this.authChecking = false;
      this.cdr.detectChanges();
    }, 2000);

    this.sub.add(
      this.authSvc.currentUser$.subscribe(user => {
        if (user) {
          if (this.checkingTimeout) {
            clearTimeout(this.checkingTimeout);
            this.checkingTimeout = undefined;
          }
          const redirect = sessionStorage.getItem('redirectAfterLogin');
          if (redirect) {
            sessionStorage.removeItem('redirectAfterLogin');
            this.router.navigateByUrl(redirect);
          } else {
            const dest = user.role === 'admin' ? '/admin' : '/dashboard';
            this.router.navigate([dest]);
          }
          return;
        }
        if (this.authReady) {
          if (this.checkingTimeout) {
            clearTimeout(this.checkingTimeout);
            this.checkingTimeout = undefined;
          }
          this.authChecking = false;
          this.cdr.detectChanges();
        }
      })
    );

    this.sub.add(
      this.authSvc.authReady$.subscribe(ready => {
        this.authReady = ready;
        if (ready && !this.authSvc.currentUser) {
          if (this.checkingTimeout) {
            clearTimeout(this.checkingTimeout);
            this.checkingTimeout = undefined;
          }
          this.authChecking = false;
          this.cdr.detectChanges();
        }
      })
    );
  }

  ngOnDestroy(): void {
    if (this.checkingTimeout) {
      clearTimeout(this.checkingTimeout);
      this.checkingTimeout = undefined;
    }
    this.sub?.unsubscribe();
  }

  async login(): Promise<void> {
    if (!this.email || !this.password) {
      this.errorMsg = 'Completa todos los campos.';
      return;
    }
    this.loading  = true;
    this.errorMsg = '';

    try {
      await this.authSvc.login(this.email, this.password);
      const user = this.authSvc.currentUser;
      if (user) {
        // Registrar en tabla histórica
        this.sessionSvc.logSession({
          uid: user.uid, email: user.email,
          displayName: user.displayName,
          loginAt: new Date(), ip: '',
          userAgent: navigator.userAgent, success: true
        }).catch(() => {});
        
        // ✅ La sesión activa se registra automáticamente en auth.service.ts
      }
    } catch (err: any) {
      // Registrar intento fallido sin uid (null para no romper columna UUID)
      this.sessionSvc.logSession({
        uid: '00000000-0000-0000-0000-000000000000',
        email: this.email, displayName: '',
        loginAt: new Date(), ip: '',
        userAgent: navigator.userAgent, success: false
      }).catch(() => {});

      const map: Record<string, string> = {
        'auth/invalid-credential':  'Correo o contraseña incorrectos.',
        'auth/email-not-confirmed': 'Confirma tu correo antes de ingresar.',
        'auth/user-disabled':       'Tu cuenta está desactivada.',
        'auth/too-many-requests':   'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
        'auth/unknown':             'Error al iniciar sesión.'
      };
      this.errorMsg = map[err.code] || err.rawMessage || 'Error al iniciar sesión.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }
}