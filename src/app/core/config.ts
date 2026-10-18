import { InjectionToken } from '@angular/core';

/**
 * Un IDaaS y el API Manager de la misma nube. Al iniciar sesión con un proveedor,
 * todas las llamadas al backend salen por su API Manager con el JWT de ese proveedor:
 *   Azure: Microsoft Entra External ID  ->  Azure API Management
 *   AWS:   Amazon Cognito               ->  AWS API Gateway
 */
export interface ProveedorConfig {
  /** Identificador interno: "azure" | "aws". */
  id: string;
  nube: string;
  /** Nombre del IDaaS (ej: Microsoft Entra External ID). */
  idaas: string;
  /** Nombre del API Manager (ej: Azure API Management). */
  apiManager: string;
  /** URL pública del API Manager (sin /api al final). */
  apiBaseUrl: string;
  /** Opcional: clave de suscripción si el API Manager la exige (Azure APIM). */
  apimSubscriptionKey?: string;
  /** Emisor de los tokens (claim iss). */
  issuer: string;
  /** Documento OpenID Connect discovery. Si se omite: {issuer}/.well-known/openid-configuration */
  discoveryUrl?: string;
  clientId: string;
  scope: string;
  /** Opcional: URL de cierre de sesión cuando el IDaaS no la publica en el discovery (Cognito). */
  logoutUrl?: string;
}

/** Configuración leída en tiempo de ejecución desde /config.json (sin recompilar). */
export interface AppConfig {
  /** false solo para desarrollo local sin IDaaS: usa apiBaseUrlLocal sin token. */
  authHabilitada: boolean;
  apiBaseUrlLocal: string;
  proveedores: ProveedorConfig[];
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

const sinBarraFinal = (url: string) => url.replace(/\/+$/, '');

export async function cargarConfig(): Promise<AppConfig> {
  const respuesta = await fetch('config.json', { cache: 'no-store' });
  if (!respuesta.ok) {
    throw new Error(`No se pudo cargar config.json (${respuesta.status})`);
  }
  const config = (await respuesta.json()) as AppConfig;
  config.apiBaseUrlLocal = sinBarraFinal(config.apiBaseUrlLocal ?? '');
  config.proveedores = (config.proveedores ?? []).map((p) => ({ ...p, apiBaseUrl: sinBarraFinal(p.apiBaseUrl) }));
  return config;
}
