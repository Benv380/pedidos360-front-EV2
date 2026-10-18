import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeEsCl from '@angular/common/locales/es-CL';
import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideOAuthClient } from 'angular-oauth2-oidc';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { AuthService } from './core/auth.service';
import { APP_CONFIG, AppConfig } from './core/config';

registerLocaleData(localeEsCl);

export function crearAppConfig(config: AppConfig): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      { provide: LOCALE_ID, useValue: 'es-CL' },
      { provide: APP_CONFIG, useValue: config },
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideOAuthClient(),
      provideAppInitializer(() => inject(AuthService).inicializar()),
    ],
  };
}
