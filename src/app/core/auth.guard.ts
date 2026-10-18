import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Protege las rutas: sin sesión válida vuelve al inicio para elegir con qué nube iniciar sesión. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (!auth.habilitada || auth.autenticado()) {
    return true;
  }
  return inject(Router).parseUrl('/');
};
