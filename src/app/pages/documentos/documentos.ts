import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService, mensajeError } from '../../core/api.service';
import { Documento } from '../../core/models';

@Component({
  selector: 'app-documentos',
  imports: [DatePipe],
  template: `
    <section class="tarjeta">
      <div class="titulo-fila">
        <h1>Documentos generados</h1>
        <button class="sec" (click)="cargar()">Actualizar</button>
      </div>
      <p class="ayuda">
        Generados de forma asíncrona por <strong>documentos-service</strong> al consumir
        <code>documentos.queue</code>: TICKET (vía fanout) y BOLETA (vía direct).
      </p>
      @if (error()) { <p class="alerta error">{{ error() }}</p> }
      <div class="dos-columnas">
        <div class="tabla-scroll">
          <table>
            <thead><tr><th>Folio</th><th>Tipo</th><th>Pedido</th><th>Fecha</th><th></th></tr></thead>
            <tbody>
              @for (d of documentos(); track d.id) {
                <tr [class.sel]="d.id === seleccionado()">
                  <td><code>{{ d.folio }}</code></td>
                  <td><span class="tag" [class.direct]="d.tipo === 'BOLETA'" [class.fanout]="d.tipo === 'TICKET'">{{ d.tipo }}</span></td>
                  <td>#{{ d.pedidoId }}</td>
                  <td>{{ d.fechaGeneracion | date: 'dd-MM HH:mm:ss' }}</td>
                  <td><button class="sec" (click)="ver(d)">Ver</button></td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="vacio">Sin documentos</td></tr>
              }
            </tbody>
          </table>
        </div>
        <pre class="documento">{{ contenido() ?? 'Selecciona un documento' }}</pre>
      </div>
    </section>
  `,
})
export class Documentos implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly documentos = signal<Documento[]>([]);
  protected readonly contenido = signal<string | null>(null);
  protected readonly seleccionado = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.api.documentos().subscribe({
      next: (d) => this.documentos.set(d),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  ver(d: Documento): void {
    this.seleccionado.set(d.id);
    this.api.contenidoDocumento(d.id).subscribe({
      next: (c) => this.contenido.set(c),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }
}
