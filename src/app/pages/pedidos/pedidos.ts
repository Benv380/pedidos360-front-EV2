import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService, mensajeError } from '../../core/api.service';
import { EstadoPedido, Pedido, SimulacionFallo } from '../../core/models';

@Component({
  selector: 'app-pedidos',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe],
  template: `
    <section class="tarjeta">
      <h1>Nuevo pedido</h1>
      <p class="ayuda">
        Al crear el pedido, <strong>pedidos-service</strong> publica <code>PEDIDO_CREADO</code> en el exchange
        <span class="tag fanout">pedidos.eventos.fanout</span>, que lo difunde a
        <code>notificaciones.queue</code>, <code>documentos.queue</code> y <code>auditoria.queue</code>.
      </p>
      <form [formGroup]="form" (ngSubmit)="crear()" class="grilla">
        <label>Cliente
          <input formControlName="cliente" maxlength="120" />
          @if (invalido('cliente')) { <small class="error">Obligatorio</small> }
        </label>
        <label>Email del cliente
          <input formControlName="emailCliente" type="email" />
          @if (invalido('emailCliente')) { <small class="error">Email válido obligatorio</small> }
        </label>
        <label class="ancho">Descripción
          <input formControlName="descripcion" maxlength="500" />
          @if (invalido('descripcion')) { <small class="error">Obligatoria</small> }
        </label>
        <label>Total (CLP)
          <input formControlName="total" type="number" min="1" />
          @if (invalido('total')) { <small class="error">Debe ser mayor a 0</small> }
        </label>
        <label>Simular fallo (demo DLQ)
          <select formControlName="simularFallo">
            @for (s of simulaciones; track s.valor) {
              <option [value]="s.valor">{{ s.texto }}</option>
            }
          </select>
        </label>
        <div class="acciones ancho">
          <button type="submit" [disabled]="enviando()">Crear pedido</button>
        </div>
      </form>
      @if (mensaje()) { <p class="alerta ok">{{ mensaje() }}</p> }
      @if (error()) { <p class="alerta error">{{ error() }}</p> }
    </section>

    <section class="tarjeta">
      <div class="titulo-fila">
        <h2>Pedidos</h2>
        <button class="sec" (click)="cargar()">Actualizar</button>
      </div>
      <p class="ayuda">
        Cambiar estado publica <code>ESTADO_CAMBIADO</code> en <span class="tag topic">pedidos.estados.topic</span>
        con routing key <code>pedido.estado.&lt;estado&gt;</code>. La boleta se solicita por
        <span class="tag direct">pedidos.documentos.direct</span> con la clave <code>documento.boleta</code>.
      </p>
      <div class="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Cliente</th><th>Descripción</th><th>Total</th><th>Estado</th><th>Creado</th>
              <th>Cambiar estado</th><th>Boleta</th>
            </tr>
          </thead>
          <tbody>
            @for (p of pedidos(); track p.id) {
              <tr>
                <td>{{ p.id }}</td>
                <td>{{ p.cliente }}<br /><small>{{ p.emailCliente }}</small></td>
                <td>{{ p.descripcion }}</td>
                <td>{{ p.total | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                <td><span class="estado" [attr.data-estado]="p.estado">{{ p.estado }}</span></td>
                <td>{{ p.fechaCreacion | date: 'dd-MM HH:mm' }}</td>
                <td>
                  @if (p.siguientesEstados.length) {
                    <div class="en-linea">
                      <select #sel>
                        @for (e of p.siguientesEstados; track e) { <option [value]="e">{{ e }}</option> }
                      </select>
                      <button class="sec" (click)="cambiarEstado(p, $any(sel.value))">Aplicar</button>
                    </div>
                  } @else { <small>—</small> }
                </td>
                <td>
                  @if (puedeBoleta(p)) {
                    <button class="sec" (click)="boleta(p)">Solicitar</button>
                  } @else { <small>—</small> }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="vacio">Sin pedidos todavía</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class Pedidos implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly pedidos = signal<Pedido[]>([]);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly enviando = signal(false);

  protected readonly simulaciones: { valor: SimulacionFallo; texto: string }[] = [
    { valor: 'NINGUNA', texto: 'Ninguno (flujo normal)' },
    { valor: 'NOTIFICACION', texto: 'Notificación: error no recuperable → DLQ' },
    { valor: 'DOCUMENTO', texto: 'Documento: error recuperable → reintentos → DLQ' },
    { valor: 'AUDITORIA', texto: 'Auditoría: error no recuperable → DLQ' },
  ];

  protected readonly form = inject(FormBuilder).nonNullable.group({
    cliente: ['', [Validators.required, Validators.maxLength(120)]],
    emailCliente: ['', [Validators.required, Validators.email]],
    descripcion: ['', [Validators.required, Validators.maxLength(500)]],
    total: [0, [Validators.required, Validators.min(1)]],
    simularFallo: ['NINGUNA' as SimulacionFallo],
  });

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.api.pedidos().subscribe({
      next: (p) => this.pedidos.set(p),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  crear(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    this.limpiar();
    this.api.crearPedido(this.form.getRawValue()).subscribe({
      next: (p) => {
        this.mensaje.set(`Pedido #${p.id} creado. Evento PEDIDO_CREADO publicado en el exchange fanout.`);
        this.form.reset();
        this.enviando.set(false);
        this.cargar();
      },
      error: (e) => {
        this.error.set(mensajeError(e));
        this.enviando.set(false);
      },
    });
  }

  cambiarEstado(p: Pedido, estado: EstadoPedido): void {
    this.limpiar();
    this.api.cambiarEstado(p.id, estado, 'NINGUNA').subscribe({
      next: () => {
        this.mensaje.set(`Pedido #${p.id}: ${p.estado} → ${estado}. Publicado con routing key pedido.estado.${estado.toLowerCase()}`);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  boleta(p: Pedido): void {
    this.limpiar();
    this.api.solicitarBoleta(p.id).subscribe({
      next: (r) => this.mensaje.set(`Pedido #${p.id}: ${r.mensaje}`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  puedeBoleta(p: Pedido): boolean {
    return p.estado === 'PAGADO' || p.estado === 'DESPACHADO' || p.estado === 'ENTREGADO';
  }

  invalido(campo: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[campo];
    return control.invalid && control.touched;
  }

  private limpiar(): void {
    this.mensaje.set(null);
    this.error.set(null);
  }
}
