export type EstadoPedido = 'CREADO' | 'PAGADO' | 'DESPACHADO' | 'ENTREGADO' | 'CANCELADO';
export type SimulacionFallo = 'NINGUNA' | 'NOTIFICACION' | 'DOCUMENTO' | 'AUDITORIA';

export interface Pedido {
  id: number;
  cliente: string;
  emailCliente: string;
  descripcion: string;
  total: number;
  estado: EstadoPedido;
  siguientesEstados: EstadoPedido[];
  creadoPor: string;
  fechaCreacion: string;
  fechaActualizacion: string;
}

export interface CrearPedido {
  cliente: string;
  emailCliente: string;
  descripcion: string;
  total: number;
  simularFallo: SimulacionFallo;
}

export interface Documento {
  id: number;
  eventoId: string;
  pedidoId: number;
  tipo: 'TICKET' | 'BOLETA';
  folio: string;
  fechaGeneracion: string;
}

export interface Notificacion {
  id: number;
  eventoId: string;
  pedidoId: number;
  destinatario: string;
  asunto: string;
  mensaje: string;
  fechaEnvio: string;
}

export interface EventoAuditoria {
  id: number;
  eventoId: string;
  tipo: string;
  pedidoId: number;
  estado: string | null;
  estadoAnterior: string | null;
  usuario: string | null;
  exchange: string;
  routingKey: string;
  fechaEvento: string;
  fechaRegistro: string;
}

// ---------------- RabbitMQ admin ----------------

export type TipoExchange = 'DIRECT' | 'TOPIC' | 'FANOUT' | 'HEADERS';
export type TipoCola = 'CLASSIC' | 'QUORUM';
export type TipoDesborde = 'DROP_HEAD' | 'REJECT_PUBLISH' | 'REJECT_PUBLISH_DLX';

export interface NodoInfo {
  nombre: string;
  activo: boolean;
  tipo: string;
  memoriaUsadaBytes: number;
  memoriaLimiteBytes: number;
  uptimeMs: number;
  alarmaMemoria: boolean;
  alarmaDisco: boolean;
}

export interface RetencionInfo {
  ttlMs: number | null;
  maxMensajes: number | null;
  desborde: string | null;
  expiraMs: number | null;
  origen: string;
}

export interface ColaInfo {
  nombre: string;
  tipo: string;
  durable: boolean;
  autoDelete: boolean;
  nodo: string;
  estado: string;
  mensajes: number;
  mensajesListos: number;
  mensajesSinAck: number;
  consumidores: number;
  utilizacionConsumidores: number | null;
  tasaPublicacion: number;
  tasaEntrega: number;
  tasaAck: number;
  memoriaBytes: number;
  esDlq: boolean;
  protegida: boolean;
  politica: string | null;
  retencion: RetencionInfo;
  ocupacionPct: number | null;
  argumentos: Record<string, unknown>;
}

export interface Alerta {
  nivel: 'CRITICO' | 'ADVERTENCIA' | 'INFO';
  recurso: string;
  mensaje: string;
  impacto: string;
}

export interface SaludMensajeria {
  colasActivas: number;
  dlqs: number;
  mensajesListos: number;
  mensajesSinAck: number;
  mensajesEnDlq: number;
  consumidores: number;
  tasaPublicacion: number;
  tasaEntrega: number;
  tasaAck: number;
  nodosActivos: number;
  nodosTotales: number;
  prefetch: number;
  alertas: Alerta[];
}

export interface EstadoConsumidor {
  id: string;
  colas: string[];
  activo: boolean;
  consumidoresActivos: number;
  /** Microservicio dueño del consumidor (lo agrega el frontend). */
  servicio?: 'notificaciones' | 'documentos';
}

export interface PoliticaInfo {
  nombre: string;
  patron: string;
  aplicaA: string;
  prioridad: number;
  definicion: Record<string, unknown>;
}

export interface GuardarPolitica {
  patron: string;
  prioridad: number | null;
  ttlMs: number | null;
  maxMensajes: number | null;
  desborde: TipoDesborde | null;
  expiraSinUsoMs: number | null;
}

export interface ExchangeInfo {
  nombre: string;
  tipo: TipoExchange;
  durable: boolean;
  autoDelete: boolean;
  protegido: boolean;
}

export interface BindingInfo {
  exchange: string;
  destino: string;
  tipoDestino: string;
  routingKey: string;
}

export interface CrearCola {
  nombre: string;
  tipo: TipoCola;
  durable: boolean;
  conDlq: boolean;
  ttlMs: number | null;
  maxMensajes: number | null;
  desborde: TipoDesborde | null;
  expiraSinUsoMs: number | null;
}

export interface CrearExchange {
  nombre: string;
  tipo: TipoExchange;
  durable: boolean;
}

export interface CrearBinding {
  exchange: string;
  cola: string;
  routingKey: string;
}
