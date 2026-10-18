import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="barra">
      <a routerLink="/" class="marca">Pedidos <strong>360</strong></a>
      <nav>
        <a routerLink="/pedidos" routerLinkActive="activo">Pedidos</a>
        <a routerLink="/documentos" routerLinkActive="activo">Documentos</a>
        <a routerLink="/actividad" routerLinkActive="activo">Actividad</a>
        <a routerLink="/rabbit" routerLinkActive="activo">Mensajería</a>
      </nav>
      <div class="sesion">
        @if (auth.autenticado()) {
          @if (auth.proveedor(); as p) {
            <span class="nube" [attr.data-nube]="p.id">{{ p.nube }} · {{ p.apiManager }}</span>
          }
          <span class="usuario">{{ auth.usuario() }}</span>
          @if (auth.habilitada) {
            <button class="sec" (click)="auth.logout()">Salir</button>
          }
        } @else {
          @for (p of auth.proveedores; track p.id) {
            <button class="nube-btn" [attr.data-nube]="p.id" (click)="auth.login(p.id)">Entrar con {{ p.nube }}</button>
          }
        }
      </div>
    </header>
    <main>
      <router-outlet />
    </main>
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
}
