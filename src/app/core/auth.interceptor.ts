import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Agrega el JWT (Authorization: Bearer ...) a toda llamada hacia el API Manager activo
 * (Azure API Management o AWS API Gateway). Si responde 401, se vuelve a iniciar sesión.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const base = auth.apiBaseUrl();

  if (!base || !req.url.startsWith(base)) {
    return next(req);
  }

  let headers = req.headers;
  const token = auth.token();
  if (token) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }
  const clave = auth.proveedor()?.apimSubscriptionKey;
  if (clave) {
    headers = headers.set('Ocp-Apim-Subscription-Key', clave);
  }

  return next(req.clone({ headers })).pipe(
    catchError((error: HttpErrorResponse) => {
      const proveedor = auth.proveedor();
      if (error.status === 401 && auth.habilitada && proveedor) {
        auth.login(proveedor.id, window.location.pathname);
      }
      return throwError(() => error);
    }),
  );
};
