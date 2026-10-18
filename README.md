# Pedidos 360 · Frontend (Angular 22)

SPA multi-nube del sistema Pedidos 360. Permite iniciar sesión con **Microsoft Entra External ID (Azure)**
o con **Amazon Cognito (AWS)** usando **OAuth 2.0 / OpenID Connect (Authorization Code + PKCE)**. Según la
nube elegida, todas las llamadas salen por su API Manager con el JWT en `Authorization: Bearer …`:

| Inicio de sesión con | IDaaS | API Manager |
|---|---|---|
| Azure | Microsoft Entra External ID | Azure API Management |
| AWS | Amazon Cognito | Amazon API Gateway |

| Vista | Qué hace |
|---|---|
| **Inicio** | Elegir nube, login/logout y claims del JWT obtenido |
| **Pedidos** | Crear pedidos (fanout), cambiar estado (topic), solicitar boleta (direct) y simular fallos para ver las DLQ |
| **Documentos** | Tickets y boletas generados de forma asíncrona |
| **Actividad** | Auditoría (exchange y routing key de cada evento) y notificaciones enviadas |
| **Mensajería** | Monitor y administración: pendientes, en vuelo, consumidores, DLQ, tasas, ocupación vs límite, **alertas con su impacto**, pausar/reanudar consumidores, retención por cola, políticas en caliente, reproceso/purga de DLQ, exchanges, bindings y nodos |

## Estructura

```
src/app/
  core/
    config.ts            configuración en tiempo de ejecución (public/config.json)
    auth.service.ts      login OIDC multi-proveedor con angular-oauth2-oidc
    auth.interceptor.ts  agrega el JWT a las llamadas hacia el API Manager activo
    auth.guard.ts        protege las rutas
    api.service.ts       cliente HTTP de todos los endpoints
    models.ts            tipos
  pages/                 inicio · pedidos · documentos · actividad · rabbit
```

## Configuración (`public/config.json`)

Se lee al arrancar, así el mismo build sirve para local y para la nube. Para la nube pon
`"authHabilitada": true` y completa ambos proveedores (son identificadores públicos, no secretos):

| Campo | Azure | AWS |
|---|---|---|
| `apiBaseUrl` | `https://<apim>.azure-api.net` | `https://<api-id>.execute-api.<region>.amazonaws.com` |
| `issuer` | `https://<TENANT_ID>.ciamlogin.com/<TENANT_ID>/v2.0` | `https://cognito-idp.<region>.amazonaws.com/<USER_POOL_ID>` |
| `discoveryUrl` | `https://<subdominio>.ciamlogin.com/<TENANT_ID>/v2.0/.well-known/openid-configuration` | (no hace falta) |
| `clientId` | Client ID de la app en Entra | App client ID de Cognito |
| `scope` | `openid profile email offline_access api://<CLIENT_ID>/pedidos.access` | `openid profile email` |
| `logoutUrl` | (no hace falta) | `https://<dominio>.auth.<region>.amazoncognito.com/logout?client_id=<CLIENT_ID>&logout_uri=<url-frontend>/` |

Con `"authHabilitada": false` funciona contra el backend local (`apiBaseUrlLocal`, docker compose) sin IDaaS.

## Comandos

```bash
npm install
npm start          # http://localhost:4200
npm run build      # dist/pedidos-frontend/browser
npm test
```

## Despliegue

- Azure Static Web Apps (plan Free): app location `/`, output `dist/pedidos-frontend/browser`
  (`public/staticwebapp.config.json` redirige las rutas de la SPA a `index.html`).
- Opcional AWS Amplify: mismo build, regla de reescritura a `/index.html`.

Pasos completos en el repositorio del backend: `docs/DESPLIEGUE_AZURE.md` y `docs/DESPLIEGUE_AWS.md`.
