import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../shared/Permission/services/auth.service';

export const authGuard: CanActivateFn = async (route) => {

  const authSvc = inject(AuthService);
  const router  = inject(Router);

  await authSvc.authReady;   // Espera inicialización

  if (!authSvc.isLoggedIn()) {
    // Guardar la URL a la que querían ir para redirigir después del login
    const fullPath = '/' + (route.routeConfig?.path ?? '');
    if (fullPath && fullPath !== '/') {
      // Construir la URL completa con el fileId si existe
      const fileId = route.paramMap?.get('fileId') ?? route.params?.['fileId'] ?? '';
      const destUrl = fileId ? `/edit/${fileId}` : fullPath;
      sessionStorage.setItem('redirectAfterLogin', destUrl);

    }
    return router.createUrlTree(['/login']);
  }

  const url = route.routeConfig?.path ?? '';
  const isAdminRoute = url === 'admin' || url.startsWith('admin/');

  if (isAdminRoute && !authSvc.isAdmin()) {
    return router.createUrlTree(['/dashboard']);
  }

  return true;
};
