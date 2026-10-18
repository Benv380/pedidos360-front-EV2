import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { OAuthService } from 'angular-oauth2-oidc';
import { APP_CONFIG, ProveedorConfig } from './config';

const CLAVE_PROVEEDOR = 'pedidos360.idaas';

/**
 * Login con OAuth 2.0 / OpenID Connect (Authorization Code + PKCE) contra el IDaaS elegido:
 * Microsoft Entra External ID (Azure) o Amazon Cognito (AWS). El access token (JWT) obtenido se envía
 * al API Manager de la misma nube mediante authInterceptor.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly oauth = inject(OAuthService);
  private readonly config = inject(APP_CONFIG);
  private readonly router = inject(Router);

  readonly autenticado = signal(false);
  readonly usuario = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly proveedor = signal<ProveedorConfig | null>(null);

  /** URL base del backend: la del API Manager del proveedor con el que se inició sesión. */
  readonly apiBaseUrl = computed(() =>
    this.habilitada ? (this.proveedor()?.apiBaseUrl ?? '') : this.config.apiBaseUrlLocal,
  );

  get habilitada(): boolean {
    return this.config.authHabilitada;
  }

  get proveedores(): ProveedorConfig[] {
    return this.config.proveedores;
  }

  async inicializar(): Promise<void> {
    if (!this.habilitada) {
      this.autenticado.set(true);
      this.usuario.set('Modo local (sin IDaaS)');
      return;
    }

    // Al volver del IDaaS se retoma el proveedor elegido antes de la redirección.
    const guardado = this.proveedores.find((p) => p.id === leerSesion(CLAVE_PROVEEDOR));
    if (!guardado) {
      return;
    }
    try {
      await this.configurar(guardado);
      await this.oauth.tryLoginCodeFlow();
      this.oauth.setupAutomaticSilentRefresh();
    } catch (e) {
      console.error('Error al inicializar OIDC', e);
      this.error.set(`No se pudo contactar a ${guardado.idaas}. Revisa config.json.`);
    }

    this.actualizarEstado();
    this.oauth.events.subscribe(() => this.actualizarEstado());

    const destino = this.oauth.state ? decodeURIComponent(this.oauth.state) : null;
    if (destino && destino.startsWith('/') && this.autenticado()) {
      await this.router.navigateByUrl(destino);
    }
  }

  async login(proveedorId: string, rutaDestino = '/pedidos'): Promise<void> {
    const proveedor = this.proveedores.find((p) => p.id === proveedorId);
    if (!this.habilitada || !proveedor) {
      return;
    }
    try {
      escribirSesion(CLAVE_PROVEEDOR, proveedor.id);
      await this.configurar(proveedor);
      this.oauth.initCodeFlow(encodeURIComponent(rutaDestino));
    } catch (e) {
      console.error('Error al iniciar sesión', e);
      this.error.set(`No se pudo contactar a ${proveedor.idaas}. Revisa config.json.`);
    }
  }

  logout(): void {
    const proveedor = this.proveedor();
    borrarSesion(CLAVE_PROVEEDOR);
    if (!this.habilitada || !proveedor) {
      return;
    }
    if (proveedor.logoutUrl) {
      // Cognito no publica end_session_endpoint: se limpia la sesión local y se usa su /logout.
      this.oauth.logOut(true);
      window.location.href = proveedor.logoutUrl;
    } else {
      this.oauth.logOut();
    }
  }

  /** Access token (JWT) vigente, o null si no hay sesión. */
  token(): string | null {
    return this.habilitada && this.oauth.hasValidAccessToken() ? this.oauth.getAccessToken() : null;
  }

  /** Claims del access token (para mostrarlos en la pantalla de inicio). */
  claimsToken(): Record<string, unknown> | null {
    const token = this.token();
    if (!token) {
      return null;
    }
    try {
      const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(payload)
          .split('')
          .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join(''),
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  expiracion(): Date | null {
    return this.token() ? new Date(this.oauth.getAccessTokenExpiration()) : null;
  }

  private async configurar(proveedor: ProveedorConfig): Promise<void> {
    this.proveedor.set(proveedor);
    this.oauth.configure({
      issuer: proveedor.issuer,
      clientId: proveedor.clientId,
      scope: proveedor.scope,
      responseType: 'code', // Authorization Code Flow + PKCE
      redirectUri: window.location.origin + '/',
      postLogoutRedirectUri: window.location.origin + '/',
      // Entra y Cognito publican sus endpoints en hosts distintos al del issuer
      strictDiscoveryDocumentValidation: false,
      skipIssuerCheck: true,
      clearHashAfterLogin: true,
      sessionChecksEnabled: false,
    });
    await this.oauth.loadDiscoveryDocument(proveedor.discoveryUrl || undefined);
  }

  private actualizarEstado(): void {
    this.autenticado.set(this.oauth.hasValidAccessToken());
    const claims = this.oauth.getIdentityClaims();
    this.usuario.set(
      (claims?.['name'] as string) ??
        (claims?.['preferred_username'] as string) ??
        (claims?.['email'] as string) ??
        (claims?.['cognito:username'] as string) ??
        null,
    );
  }
}

function leerSesion(clave: string): string | null {
  try {
    return sessionStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribirSesion(clave: string, valor: string): void {
  try {
    sessionStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: el login igual funciona en esta pestaña */
  }
}

function borrarSesion(clave: string): void {
  try {
    sessionStorage.removeItem(clave);
  } catch {
    /* nada que limpiar */
  }
}
