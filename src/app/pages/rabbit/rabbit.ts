import { DecimalPipe, KeyValuePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EMPTY, Observable, catchError, forkJoin, interval, map, of, startWith, switchMap } from 'rxjs';
import { ApiService, mensajeError } from '../../core/api.service';
import {
  BindingInfo,
  ColaInfo,
  EstadoConsumidor,
  ExchangeInfo,
  NodoInfo,
  PoliticaInfo,
  SaludMensajeria,
  TipoCola,
  TipoDesborde,
  TipoExchange,
} from '../../core/models';

const PATRON_NOMBRE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const SERVICIOS_CONSUMIDORES = ['notificaciones', 'documentos'] as const;

/**
 * Monitor y administración de la mensajería: salud y alertas, consumidores (pausar/reanudar), colas con
 * métricas y retención, políticas de retención en caliente, exchanges, bindings y nodos del clúster.
 */
@Component({
  selector: 'app-rabbit',
  imports: [ReactiveFormsModule, DecimalPipe, KeyValuePipe],
  template: `
    @if (mensaje()) { <p class="alerta ok">{{ mensaje() }}</p> }
    @if (error()) { <p class="alerta error">{{ error() }}</p> }

    <!-- ===================== Resumen ===================== -->
    <section class="tarjeta">
      <div class="titulo-fila">
        <h1>Monitor de mensajería</h1>
        <small class="ayuda">Actualización cada 3 s · prefetch {{ salud()?.prefetch }}</small>
      </div>
      @if (salud(); as s) {
        <div class="kpis">
          <div class="kpi"><span>Colas activas</span><strong>{{ s.colasActivas }}</strong><small>+ {{ s.dlqs }} DLQ</small></div>
          <div class="kpi" [class.mal]="s.mensajesListos > 0"><span>Pendientes (Ready)</span><strong>{{ s.mensajesListos }}</strong><small>backlog por procesar</small></div>
          <div class="kpi"><span>En vuelo (sin ACK)</span><strong>{{ s.mensajesSinAck }}</strong><small>entregados, sin confirmar</small></div>
          <div class="kpi" [class.mal]="s.consumidores === 0"><span>Consumidores</span><strong>{{ s.consumidores }}</strong><small>hilos conectados</small></div>
          <div class="kpi" [class.mal]="s.mensajesEnDlq > 0"><span>En DLQ</span><strong>{{ s.mensajesEnDlq }}</strong><small>mensajes fallidos</small></div>
          <div class="kpi"><span>Tasas (msg/s)</span><strong>{{ s.tasaPublicacion | number: '1.1-1' }} → {{ s.tasaEntrega | number: '1.1-1' }}</strong><small>publicación → entrega · ACK {{ s.tasaAck | number: '1.1-1' }}</small></div>
          <div class="kpi" [class.mal]="s.nodosActivos < s.nodosTotales"><span>Nodos</span><strong>{{ s.nodosActivos }}/{{ s.nodosTotales }}</strong><small>clúster</small></div>
        </div>
      }
    </section>

    <!-- ===================== Alertas ===================== -->
    <section class="tarjeta">
      <h2>Salud y su impacto</h2>
      <ul class="alertas">
        @for (a of salud()?.alertas ?? []; track $index) {
          <li [attr.data-nivel]="a.nivel">
            <span class="nivel">{{ a.nivel }}</span>
            <div>
              <strong>{{ a.recurso }}</strong> · {{ a.mensaje }}
              <p>{{ a.impacto }}</p>
            </div>
          </li>
        }
      </ul>
    </section>

    <!-- ===================== Consumidores ===================== -->
    <section class="tarjeta">
      <h2>Consumidores</h2>
      <p class="ayuda">
        Pausar un consumidor deja de entregar mensajes: los nuevos quedan <strong>pendientes</strong> en la cola y se
        acercan al TTL y al largo máximo. Al reanudar, se procesan los acumulados.
      </p>
      <div class="tabla-scroll">
        <table>
          <thead><tr><th>Consumidor</th><th>Microservicio</th><th>Cola</th><th>Estado</th><th>Hilos activos</th><th></th></tr></thead>
          <tbody>
            @for (c of consumidores(); track c.servicio + c.id) {
              <tr>
                <td><code>{{ c.id }}</code></td>
                <td>{{ c.servicio }}-service</td>
                <td>{{ c.colas.join(', ') }}</td>
                <td><span class="estado" [attr.data-estado]="c.activo ? 'ENTREGADO' : 'CANCELADO'">{{ c.activo ? 'ACTIVO' : 'PAUSADO' }}</span></td>
                <td>{{ c.consumidoresActivos }}</td>
                <td>
                  @if (c.activo) {
                    <button class="peligro" (click)="cambiarConsumidor(c, 'pausar')">Pausar</button>
                  } @else {
                    <button (click)="cambiarConsumidor(c, 'reanudar')">Reanudar</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="vacio">Sin información de consumidores</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <!-- ===================== Colas ===================== -->
    <section class="tarjeta">
      <h2>Colas</h2>
      <div class="tabla-scroll">
        <table class="colas">
          <thead>
            <tr>
              <th>Cola</th><th>Pendientes</th><th>Sin ACK</th><th>Cons.</th><th>Uso cons.</th>
              <th>Pub/s</th><th>Entrega/s</th><th>Ocupación</th><th>TTL</th><th>Desborde</th><th>Retención</th><th></th>
            </tr>
          </thead>
          <tbody>
            @for (c of colas(); track c.nombre) {
              <tr [class.dlq]="c.esDlq">
                <td>
                  <code>{{ c.nombre }}</code>
                  @if (c.esDlq) { <span class="tag dlq">DLQ</span> }
                  @if (c.protegida) { <span class="tag">base</span> }
                  <br /><small>{{ c.tipo }} · {{ c.nodo }}</small>
                </td>
                <td [class.alerta-num]="c.mensajesListos > 0">{{ c.mensajesListos }}</td>
                <td>{{ c.mensajesSinAck }}</td>
                <td [class.alerta-num]="!c.esDlq && c.consumidores === 0">{{ c.consumidores }}</td>
                <td>{{ c.utilizacionConsumidores === null || c.consumidores === 0 ? '—' : (c.utilizacionConsumidores * 100 | number: '1.0-0') + ' %' }}</td>
                <td>{{ c.tasaPublicacion | number: '1.1-1' }}</td>
                <td>{{ c.tasaEntrega | number: '1.1-1' }}</td>
                <td class="ocupacion">
                  @if (c.ocupacionPct !== null) {
                    <div class="barra-ocupacion" [attr.data-nivel]="nivelOcupacion(c.ocupacionPct)">
                      <div [style.width.%]="c.ocupacionPct > 100 ? 100 : c.ocupacionPct"></div>
                    </div>
                    <small>{{ c.mensajes }} / {{ c.retencion.maxMensajes }}</small>
                  } @else { <small>sin límite</small> }
                </td>
                <td>{{ duracion(c.retencion.ttlMs) }}</td>
                <td><small>{{ c.retencion.desborde ?? '—' }}</small></td>
                <td><small>{{ c.retencion.origen }}</small></td>
                <td class="acciones-cola">
                  @if (c.esDlq) {
                    <button class="sec" (click)="reprocesar(c)" [disabled]="c.mensajes === 0" title="Devuelve los mensajes a su cola de origen">Reprocesar</button>
                  }
                  @if (!c.protegida) {
                    <button class="sec" (click)="publicarPrueba(c)" title="Publica 3 mensajes de prueba">+3 msgs</button>
                  }
                  <button class="sec" (click)="purgar(c)" [disabled]="c.mensajes === 0">Purgar</button>
                  <button class="peligro" (click)="eliminarCola(c)" [disabled]="c.protegida">Eliminar</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <h3>Crear cola (con retención)</h3>
      <form [formGroup]="formCola" (ngSubmit)="crearCola()" class="grilla">
        <label>Nombre <input formControlName="nombre" placeholder="demo.queue" /></label>
        <label>Tipo
          <select formControlName="tipo"><option value="CLASSIC">CLASSIC</option><option value="QUORUM">QUORUM</option></select>
        </label>
        <label>TTL de mensajes (ms) <input formControlName="ttlMs" type="number" min="1000" placeholder="15000" /></label>
        <label>Largo máximo <input formControlName="maxMensajes" type="number" min="1" placeholder="5" /></label>
        <label>Desborde
          <select formControlName="desborde">
            <option [ngValue]="null">— (drop-head por defecto)</option>
            @for (d of desbordes; track d.valor) { <option [ngValue]="d.valor">{{ d.texto }}</option> }
          </select>
        </label>
        <label>Eliminar si no se usa (ms) <input formControlName="expiraSinUsoMs" type="number" min="10000" placeholder="opcional" /></label>
        <label class="check"><input type="checkbox" formControlName="durable" /> Durable</label>
        <label class="check"><input type="checkbox" formControlName="conDlq" /> Con DLQ (&lt;nombre&gt;.dlq)</label>
        <div class="acciones ancho"><button type="submit">Crear cola</button></div>
      </form>
    </section>

    <!-- ===================== Políticas ===================== -->
    <section class="tarjeta">
      <h2>Políticas de retención (en caliente)</h2>
      <p class="ayuda">
        Una política aplica límites a todas las colas cuyo nombre calza con el patrón, <strong>sin recrearlas</strong>
        (los argumentos x-* son inmutables). Si hay argumento y política, para TTL y largo máximo rige el menor.
      </p>
      <div class="tabla-scroll">
        <table>
          <thead><tr><th>Nombre</th><th>Patrón</th><th>Prioridad</th><th>Definición</th><th></th></tr></thead>
          <tbody>
            @for (p of politicas(); track p.nombre) {
              <tr>
                <td><code>{{ p.nombre }}</code></td>
                <td><code>{{ p.patron }}</code></td>
                <td>{{ p.prioridad }}</td>
                <td>@for (d of p.definicion | keyvalue; track d.key) { <code>{{ d.key }}={{ d.value }}</code> }</td>
                <td><button class="peligro" (click)="eliminarPolitica(p)">Eliminar</button></td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="vacio">Sin políticas: rigen los argumentos de cada cola</td></tr>
            }
          </tbody>
        </table>
      </div>
      <h3>Crear o reemplazar política</h3>
      <form [formGroup]="formPolitica" (ngSubmit)="guardarPolitica()" class="grilla">
        <label>Nombre <input formControlName="nombre" placeholder="limite-demo" /></label>
        <label>Patrón (regex) <input formControlName="patron" placeholder="^demo\\." /></label>
        <label>TTL (ms) <input formControlName="ttlMs" type="number" min="1000" /></label>
        <label>Largo máximo <input formControlName="maxMensajes" type="number" min="1" /></label>
        <label>Desborde
          <select formControlName="desborde">
            <option [ngValue]="null">—</option>
            @for (d of desbordes; track d.valor) { <option [ngValue]="d.valor">{{ d.texto }}</option> }
          </select>
        </label>
        <label>Prioridad <input formControlName="prioridad" type="number" min="0" max="999" /></label>
        <div class="acciones ancho"><button type="submit">Aplicar política</button></div>
      </form>
    </section>

    <!-- ===================== Exchanges y bindings ===================== -->
    <section class="tarjeta">
      <h2>Exchanges</h2>
      <div class="tabla-scroll">
        <table>
          <thead><tr><th>Nombre</th><th>Tipo</th><th>Durable</th><th></th></tr></thead>
          <tbody>
            @for (x of exchanges(); track x.nombre) {
              <tr>
                <td><code>{{ x.nombre }}</code> @if (x.protegido) { <span class="tag">base</span> }</td>
                <td><span [class]="'tag ' + x.tipo.toLowerCase()">{{ x.tipo }}</span></td>
                <td>{{ x.durable ? 'sí' : 'no' }}</td>
                <td><button class="peligro" (click)="eliminarExchange(x)" [disabled]="x.protegido">Eliminar</button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <h3>Crear exchange</h3>
      <form [formGroup]="formExchange" (ngSubmit)="crearExchange()" class="grilla">
        <label>Nombre <input formControlName="nombre" placeholder="pagos.fanout" /></label>
        <label>Tipo
          <select formControlName="tipo">
            @for (t of tiposExchange; track t) { <option [value]="t">{{ t }}</option> }
          </select>
        </label>
        <label class="check"><input type="checkbox" formControlName="durable" /> Durable</label>
        <div class="acciones"><button type="submit">Crear exchange</button></div>
      </form>

      <h2 class="separado">Bindings</h2>
      <div class="tabla-scroll">
        <table>
          <thead><tr><th>Exchange</th><th></th><th>Cola</th><th>Routing key</th><th></th></tr></thead>
          <tbody>
            @for (b of bindings(); track b.exchange + b.destino + b.routingKey) {
              <tr>
                <td><code>{{ b.exchange }}</code></td>
                <td>→</td>
                <td><code>{{ b.destino }}</code></td>
                <td><code>{{ b.routingKey || '(vacía)' }}</code></td>
                <td><button class="peligro" (click)="eliminarBinding(b)">Eliminar</button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <h3>Crear binding</h3>
      <form [formGroup]="formBinding" (ngSubmit)="crearBinding()" class="grilla">
        <label>Exchange
          <select formControlName="exchange">
            <option value="">— seleccionar —</option>
            @for (x of exchanges(); track x.nombre) { <option [value]="x.nombre">{{ x.nombre }} ({{ x.tipo }})</option> }
          </select>
        </label>
        <label>Cola
          <select formControlName="cola">
            <option value="">— seleccionar —</option>
            @for (c of colasNoDlq(); track c.nombre) { <option [value]="c.nombre">{{ c.nombre }}</option> }
          </select>
        </label>
        <label>Routing key <input formControlName="routingKey" placeholder="pedido.estado.* (vacía en fanout)" /></label>
        <div class="acciones"><button type="submit">Crear binding</button></div>
      </form>
    </section>

    <!-- ===================== Nodos ===================== -->
    <section class="tarjeta">
      <h2>Clúster RabbitMQ</h2>
      <div class="nodos">
        @for (n of nodos(); track n.nombre) {
          <div class="nodo" [class.caido]="!n.activo || n.alarmaMemoria || n.alarmaDisco">
            <strong>{{ n.nombre }}</strong>
            <span>{{ n.activo ? 'activo' : 'caído' }} · {{ n.tipo }}
              @if (n.alarmaMemoria) { · ALARMA MEMORIA } @if (n.alarmaDisco) { · ALARMA DISCO }</span>
            <small>memoria {{ n.memoriaUsadaBytes / 1048576 | number: '1.0-0' }} / {{ n.memoriaLimiteBytes / 1048576 | number: '1.0-0' }} MB
              · {{ n.uptimeMs / 60000 | number: '1.0-0' }} min</small>
          </div>
        }
      </div>
    </section>
  `,
})
export class Rabbit implements OnInit {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly salud = signal<SaludMensajeria | null>(null);
  protected readonly consumidores = signal<EstadoConsumidor[]>([]);
  protected readonly nodos = signal<NodoInfo[]>([]);
  protected readonly colas = signal<ColaInfo[]>([]);
  protected readonly exchanges = signal<ExchangeInfo[]>([]);
  protected readonly bindings = signal<BindingInfo[]>([]);
  protected readonly politicas = signal<PoliticaInfo[]>([]);
  protected readonly colasNoDlq = computed(() => this.colas().filter((c) => !c.esDlq));
  protected readonly mensaje = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly tiposExchange: TipoExchange[] = ['DIRECT', 'TOPIC', 'FANOUT'];
  protected readonly desbordes: { valor: TipoDesborde; texto: string }[] = [
    { valor: 'REJECT_PUBLISH_DLX', texto: 'reject-publish-dlx (nuevo → DLQ)' },
    { valor: 'REJECT_PUBLISH', texto: 'reject-publish (nuevo → NACK al productor)' },
    { valor: 'DROP_HEAD', texto: 'drop-head (descarta el más antiguo)' },
  ];

  protected readonly formCola = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100), Validators.pattern(PATRON_NOMBRE)]],
    tipo: ['CLASSIC' as TipoCola],
    durable: [true],
    conDlq: [true],
    ttlMs: [null as number | null, [Validators.min(1000)]],
    maxMensajes: [null as number | null, [Validators.min(1)]],
    desborde: [null as TipoDesborde | null],
    expiraSinUsoMs: [null as number | null, [Validators.min(10000)]],
  });

  protected readonly formPolitica = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.pattern(PATRON_NOMBRE)]],
    patron: ['', [Validators.required, Validators.maxLength(200)]],
    ttlMs: [null as number | null, [Validators.min(1000)]],
    maxMensajes: [null as number | null, [Validators.min(1)]],
    desborde: [null as TipoDesborde | null],
    prioridad: [1 as number | null, [Validators.min(0), Validators.max(999)]],
  });

  protected readonly formExchange = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100), Validators.pattern(PATRON_NOMBRE)]],
    tipo: ['DIRECT' as TipoExchange],
    durable: [true],
  });

  protected readonly formBinding = this.fb.nonNullable.group({
    exchange: ['', Validators.required],
    cola: ['', Validators.required],
    routingKey: ['', [Validators.maxLength(255), Validators.pattern(/^[a-zA-Z0-9._*#-]*$/)]],
  });

  ngOnInit(): void {
    interval(3000)
      .pipe(
        startWith(0),
        switchMap(() => this.cargarTodo()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  // ---------------- Consumidores ----------------

  cambiarConsumidor(c: EstadoConsumidor, accion: 'pausar' | 'reanudar'): void {
    if (!c.servicio) return;
    this.ejecutar(
      this.api.cambiarConsumidor(c.servicio, c.id, accion),
      `Consumidor ${c.id} ${accion === 'pausar' ? 'pausado: los mensajes nuevos quedarán pendientes' : 'reanudado'}`,
    );
  }

  // ---------------- Colas ----------------

  crearCola(): void {
    if (this.validar(this.formCola, 'Revisa el nombre (3-100: letras, números, . - _) y los valores numéricos')) {
      const v = this.formCola.getRawValue();
      this.ejecutar(
        this.api.crearCola({
          nombre: v.nombre ?? '',
          tipo: v.tipo ?? 'CLASSIC',
          durable: v.durable ?? true,
          conDlq: v.conDlq ?? false,
          ttlMs: v.ttlMs || null,
          maxMensajes: v.maxMensajes || null,
          desborde: v.desborde,
          expiraSinUsoMs: v.expiraSinUsoMs || null,
        }),
        `Cola ${v.nombre} creada`,
        () => this.formCola.reset({ tipo: 'CLASSIC', durable: true, conDlq: true }),
      );
    }
  }

  publicarPrueba(c: ColaInfo): void {
    this.ejecutar(this.api.publicarPrueba(c.nombre, 3), `3 mensajes de prueba publicados en ${c.nombre}`);
  }

  reprocesar(c: ColaInfo): void {
    if (confirm(`¿Devolver los mensajes de ${c.nombre} a su cola de origen para reprocesarlos?`)) {
      this.ejecutar(this.api.reprocesarDlq(c.nombre), `Mensajes de ${c.nombre} devueltos a su cola de origen`);
    }
  }

  purgar(c: ColaInfo): void {
    if (confirm(`¿Eliminar los ${c.mensajes} mensajes de ${c.nombre}?`)) {
      this.ejecutar(this.api.purgarCola(c.nombre), `Cola ${c.nombre} purgada`);
    }
  }

  eliminarCola(c: ColaInfo): void {
    if (confirm(`¿Eliminar la cola ${c.nombre}?`)) {
      this.ejecutar(this.api.eliminarCola(c.nombre), `Cola ${c.nombre} eliminada`);
    }
  }

  // ---------------- Políticas ----------------

  guardarPolitica(): void {
    if (this.validar(this.formPolitica, 'Nombre y patrón son obligatorios; define al menos TTL o largo máximo')) {
      const v = this.formPolitica.getRawValue();
      this.ejecutar(
        this.api.guardarPolitica(v.nombre ?? '', {
          patron: v.patron ?? '',
          prioridad: v.prioridad,
          ttlMs: v.ttlMs || null,
          maxMensajes: v.maxMensajes || null,
          desborde: v.desborde,
          expiraSinUsoMs: null,
        }),
        `Política ${v.nombre} aplicada a las colas que calzan con ${v.patron}`,
        () => this.formPolitica.reset({ prioridad: 1 }),
      );
    }
  }

  eliminarPolitica(p: PoliticaInfo): void {
    if (confirm(`¿Eliminar la política ${p.nombre}?`)) {
      this.ejecutar(this.api.eliminarPolitica(p.nombre), `Política ${p.nombre} eliminada`);
    }
  }

  // ---------------- Exchanges y bindings ----------------

  crearExchange(): void {
    if (this.validar(this.formExchange, 'Revisa el nombre del exchange (3-100: letras, números, . - _)')) {
      this.ejecutar(this.api.crearExchange(this.formExchange.getRawValue()), `Exchange ${this.formExchange.value.nombre} creado`, () =>
        this.formExchange.reset(),
      );
    }
  }

  crearBinding(): void {
    if (this.validar(this.formBinding, 'Selecciona exchange y cola; la routing key solo admite letras, números, . - _ * #')) {
      const b = this.formBinding.getRawValue();
      this.ejecutar(this.api.crearBinding(b), `Binding ${b.exchange} → ${b.cola} creado`, () => this.formBinding.reset());
    }
  }

  eliminarExchange(x: ExchangeInfo): void {
    if (confirm(`¿Eliminar el exchange ${x.nombre}?`)) {
      this.ejecutar(this.api.eliminarExchange(x.nombre), `Exchange ${x.nombre} eliminado`);
    }
  }

  eliminarBinding(b: BindingInfo): void {
    if (confirm(`¿Eliminar el binding ${b.exchange} → ${b.destino}?`)) {
      this.ejecutar(
        this.api.eliminarBinding({ exchange: b.exchange, cola: b.destino, routingKey: b.routingKey }),
        `Binding ${b.exchange} → ${b.destino} eliminado`,
      );
    }
  }

  // ---------------- Utilidades ----------------

  nivelOcupacion(pct: number): string {
    return pct >= 80 ? 'critico' : pct >= 50 ? 'advertencia' : 'ok';
  }

  duracion(ms: number | null): string {
    if (ms === null) return '—';
    if (ms >= 86_400_000) return `${+(ms / 86_400_000).toFixed(1)} d`;
    if (ms >= 3_600_000) return `${+(ms / 3_600_000).toFixed(1)} h`;
    if (ms >= 60_000) return `${+(ms / 60_000).toFixed(1)} min`;
    return `${ms / 1000} s`;
  }

  private cargarTodo(): Observable<unknown> {
    const consumidores$ = forkJoin(
      SERVICIOS_CONSUMIDORES.map((s) =>
        this.api.consumidores(s).pipe(
          map((lista) => lista.map((c) => ({ ...c, servicio: s }))),
          catchError(() => of([] as EstadoConsumidor[])),
        ),
      ),
    ).pipe(map((listas) => listas.flat()));

    return forkJoin({
      salud: this.api.salud(),
      colas: this.api.colas(),
      nodos: this.api.nodos(),
      exchanges: this.api.exchanges(),
      bindings: this.api.bindings(),
      politicas: this.api.politicas(),
      consumidores: consumidores$,
    }).pipe(
      map((r) => {
        this.salud.set(r.salud);
        this.colas.set(r.colas);
        this.nodos.set(r.nodos);
        this.exchanges.set(r.exchanges);
        this.bindings.set(r.bindings);
        this.politicas.set(r.politicas);
        this.consumidores.set(r.consumidores);
        return r;
      }),
      catchError((e) => {
        this.error.set(mensajeError(e));
        return EMPTY;
      }),
    );
  }

  private validar(form: { invalid: boolean; markAllAsTouched(): void }, texto: string): boolean {
    this.mensaje.set(null);
    if (form.invalid) {
      form.markAllAsTouched();
      this.error.set(texto);
      return false;
    }
    this.error.set(null);
    return true;
  }

  private ejecutar(op: Observable<unknown>, exito: string, despues?: () => void): void {
    this.mensaje.set(null);
    this.error.set(null);
    op.subscribe({
      next: () => {
        this.mensaje.set(exito);
        despues?.();
        this.cargarTodo().subscribe();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }
}
