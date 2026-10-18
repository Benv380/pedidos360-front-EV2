import { DatePipe, JsonPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-inicio',
  imports: [RouterLink, JsonPipe, DatePipe],
  template: `
    <section class="tarjeta">
      <h1>Pedidos 360</h1>
      <p>
        Sistema cloud native multi-nube: microservicios Spring Boot, mensajería asíncrona con un clúster
        RabbitMQ (exchanges <span class="tag fanout">fanout</span> <span class="tag topic">topic</span>
        <span class="tag direct">direct</span> y DLQ), autenticación con IDaaS y acceso vía API Manager
        en <strong>Azure</strong> y <strong>AWS</strong>.
      </p>
      @if (auth.error()) {
        <p class="alerta error">{{ auth.error() }}</p>
      }
      @if (auth.autenticado()) {
        <p class="alerta ok">Sesión iniciada como <strong>{{ auth.usuario() }}</strong>.</p>
        <a routerLink="/pedidos" class="boton">Ir a pedidos</a>
      }
    </section>

    @if (auth.habilitada) {
      <div class="nubes">
        @for (p of auth.proveedores; track p.id) {
          <section class="tarjeta nube-tarjeta" [attr.data-nube]="p.id" [class.activa]="auth.proveedor()?.id === p.id && auth.autenticado()">
            <h2>{{ p.nube }}</h2>
            <dl class="datos">
              <dt>IDaaS</dt><dd>{{ p.idaas }}</dd>
              <dt>API Manager</dt><dd>{{ p.apiManager }}</dd>
              <dt>URL</dt><dd><code>{{ p.apiBaseUrl }}</code></dd>
            </dl>
            @if (auth.proveedor()?.id === p.id && auth.autenticado()) {
              <p class="alerta ok">Sesión activa: las llamadas salen por {{ p.apiManager }}.</p>
            } @else {
              <button (click)="auth.login(p.id)">Entrar con {{ p.nube }}</button>
            }
          </section>
        }
      </div>
    } @else {
      <section class="tarjeta">
        <p class="alerta ok">Modo local: sin IDaaS, llamadas directas a <code>{{ auth.apiBaseUrl() }}</code>.</p>
      </section>
    }

    @if (claims(); as c) {
      <section class="tarjeta">
        <h2>JWT emitido por {{ auth.proveedor()?.idaas }}</h2>
        <p class="ayuda">
          Este access token viaja en <code>Authorization: Bearer …</code>. {{ auth.proveedor()?.apiManager }} y los
          microservicios validan su firma, emisor (<code>iss</code>), audiencia
          (<code>{{ auth.proveedor()?.id === 'aws' ? 'client_id' : 'aud' }}</code>) y expiración
          (<code>exp</code>{{ auth.expiracion() ? ': ' + (auth.expiracion() | date: 'HH:mm:ss') : '' }}).
        </p>
        <pre>{{ c | json }}</pre>
      </section>
    }
  `,
})
export class Inicio {
  protected readonly auth = inject(AuthService);
  protected readonly claims = computed(() => (this.auth.autenticado() ? this.auth.claimsToken() : null));
}
