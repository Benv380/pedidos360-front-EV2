import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, forkJoin, interval, startWith, switchMap } from 'rxjs';
import { ApiService, mensajeError } from '../../core/api.service';
import { EventoAuditoria, Notificacion } from '../../core/models';

@Component({
  selector: 'app-actividad',
  imports: [DatePipe],
  template: `
    <section class="tarjeta">
      <div class="titulo-fila">
        <h1>Auditoría de eventos</h1>
        <small class="ayuda">Se actualiza cada 5 s</small>
      </div>
      <p class="ayuda">
        <code>auditoria.queue</code> está enlazada a los tres exchanges, por eso aquí se ve por cuál llegó cada
        evento: <span class="tag fanout">fanout</span> (pedido creado), <span class="tag topic">topic</span>
        (cambio de estado, patrón <code>pedido.#</code>) y <span class="tag direct">direct</span> (boleta).
      </p>
      @if (error()) { <p class="alerta error">{{ error() }}</p> }
      <div class="tabla-scroll">
        <table>
          <thead>
            <tr><th>Fecha</th><th>Evento</th><th>Pedido</th><th>Estado</th><th>Exchange</th><th>Routing key</th><th>Usuario</th></tr>
          </thead>
          <tbody>
            @for (a of auditoria(); track a.id) {
              <tr>
                <td>{{ a.fechaRegistro | date: 'dd-MM HH:mm:ss' }}</td>
                <td>{{ a.tipo }}</td>
                <td>#{{ a.pedidoId }}</td>
                <td>{{ a.estadoAnterior ? a.estadoAnterior + ' → ' : '' }}{{ a.estado }}</td>
                <td><span class="tag" [class]="claseExchange(a.exchange)">{{ a.exchange }}</span></td>
                <td><code>{{ a.routingKey || '(vacía)' }}</code></td>
                <td>{{ a.usuario }}</td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="vacio">Sin eventos</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="tarjeta">
      <h2>Notificaciones enviadas</h2>
      <p class="ayuda">Consumidas desde <code>notificaciones.queue</code> (fanout + topic <code>pedido.estado.*</code>).</p>
      <div class="tabla-scroll">
        <table>
          <thead><tr><th>Fecha</th><th>Pedido</th><th>Para</th><th>Asunto</th><th>Mensaje</th></tr></thead>
          <tbody>
            @for (n of notificaciones(); track n.id) {
              <tr>
                <td>{{ n.fechaEnvio | date: 'dd-MM HH:mm:ss' }}</td>
                <td>#{{ n.pedidoId }}</td>
                <td>{{ n.destinatario }}</td>
                <td>{{ n.asunto }}</td>
                <td>{{ n.mensaje }}</td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="vacio">Sin notificaciones</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class Actividad implements OnInit {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly auditoria = signal<EventoAuditoria[]>([]);
  protected readonly notificaciones = signal<Notificacion[]>([]);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    interval(5000)
      .pipe(
        startWith(0),
        switchMap(() =>
          forkJoin({ a: this.api.auditoria(), n: this.api.notificaciones() }).pipe(
            catchError((e) => {
              this.error.set(mensajeError(e));
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ a, n }) => {
        this.auditoria.set(a);
        this.notificaciones.set(n);
        this.error.set(null);
      });
  }

  claseExchange(exchange: string): string {
    if (exchange.includes('fanout')) return 'tag fanout';
    if (exchange.includes('topic')) return 'tag topic';
    if (exchange.includes('direct')) return 'tag direct';
    return 'tag';
  }
}
