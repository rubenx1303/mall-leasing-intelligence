/**
 * Modelo operativo de la demostración: un centro comercial FICTICIO en explotación
 * (locales, inquilinos, contratos de arrendamiento, recibos de renta, cobros, reservas y
 * actividad comercial de los locales vacíos). Ningún dato corresponde a un centro real.
 * Importes ficticios en COP, enteros (sin decimales). Fechas en ISO 'AAAA-MM-DD'.
 */

export type ISODate = string;

/** Estado de un local en una fecha de corte. Una reserva NO es un contrato. */
export type EstadoComercial = 'ocupado' | 'reservado' | 'disponible' | 'no_comercializable';

export const ESTADOS: readonly EstadoComercial[] = ['ocupado', 'reservado', 'disponible', 'no_comercializable'] as const;

/** Situación contractual de un local en el corte (filtro «estado del contrato»). */
export type EstadoContractual = 'vigente' | 'por_vencer' | 'sin_contrato';

/** Días hasta el fin del contrato a partir de los cuales se considera «por vencer». */
export const DIAS_POR_VENCER = 90;

export interface Planta {
  id: number;
  codigo: string;
  nombre: string;
  nivel: number;
  /** Dimensiones del lienzo del plano en unidades (10 unidades = 1 m). */
  ancho: number;
  alto: number;
}

export type TipoZona = 'ancla' | 'galeria' | 'plaza' | 'comidas';

export interface Zona {
  id: number;
  plantaId: number;
  codigo: string;
  nombre: string;
  tipo: TipoZona;
}

export interface Categoria {
  id: number;
  codigo: string;
  nombre: string;
  grupo: 'Ancla' | 'Comercio' | 'Restauración' | 'Ocio' | 'Servicios';
}

export type TipoLocal = 'ancla' | 'local' | 'isla' | 'tecnico';

export interface Local {
  id: number;
  codigo: string;
  plantaId: number;
  zonaId: number;
  /** Uso previsto en el plan de mezcla comercial (null en espacios no comercializables). */
  categoriaId: number | null;
  tipo: TipoLocal;
  comercializable: boolean;
  /** Rectángulo en el plano (unidades de 0,1 m). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Superficie en m², derivada de la geometría: w·h/100. */
  areaM2: number;
  /** Renta de lista mensual por m² (COP) a la apertura. 0 si no se alquila. */
  canonM2: number;
  /** Fecha desde la que el local se comercializa (apertura del centro); null si no comercializable. */
  fechaLanzamiento: ISODate | null;
  descripcion?: string;
}

/** Elementos de contexto del plano (circulaciones, accesos, plazas). No son locales. */
export interface ElementoPlano {
  plantaId: number;
  tipo: 'circulacion' | 'acceso' | 'plaza' | 'escaleras' | 'banos' | 'terraza';
  etiqueta: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Inquilino o interesado. Sin datos personales: código y marca inventada. */
export interface Cliente {
  id: number;
  codigo: string;
  nombreComercial: string;
  categoriaId: number;
  tipoPersona: 'juridica' | 'natural';
  canal: Canal;
  fechaAlta: ISODate;
}

export type Canal = 'web' | 'whatsapp' | 'referido' | 'feria' | 'visita_sala' | 'broker';

export type TipoActividad = 'lead' | 'visita' | 'propuesta' | 'reserva' | 'contrato' | 'renovacion' | 'desistimiento';

export interface Actividad {
  id: number;
  clienteId: number;
  localId: number;
  tipo: TipoActividad;
  fecha: ISODate;
  canal: Canal;
}

export type EstadoReserva = 'activa' | 'convertida' | 'vencida' | 'cancelada';

export interface Reserva {
  id: number;
  codigo: string;
  localId: number;
  clienteId: number;
  fechaReserva: ISODate;
  /** Último día de validez de la reserva. */
  fechaVencimiento: ISODate;
  /** Fecha en que dejó de estar activa (firma, cancelación o día siguiente al vencimiento). */
  fechaCierre: ISODate | null;
  estado: EstadoReserva;
  importeSeparacion: number;
}

export type EstadoContrato = 'vigente' | 'finalizado' | 'rescindido';

/** Contrato de arrendamiento. */
export interface Contrato {
  id: number;
  codigo: string;
  localId: number;
  clienteId: number;
  /** Reserva previa que se convirtió en este contrato (null en renovaciones). */
  reservaId: number | null;
  /** Contrato anterior del mismo inquilino si es una renovación. */
  renovacionDe: number | null;
  tipo: 'arriendo';
  /** Actividad del inquilino. */
  categoriaId: number;
  fechaFirma: ISODate;
  fechaInicio: ISODate;
  /** Último día del plazo pactado. */
  fechaFin: ISODate;
  /** Rescisión anticipada (null si no la hubo). El contrato deja de estar vigente ese día. */
  fechaTerminacion: ISODate | null;
  plazoMeses: number;
  areaM2: number;
  canonMensual: number;
  /** canon mensual × plazo. */
  valorTotal: number;
  /** Renta de lista × plazo (para medir descuentos). */
  valorLista: number;
  /** Estado en la fecha de corte del conjunto de datos. */
  estado: EstadoContrato;
}

/** Recibo mensual de renta. Se considera facturado cuando fechaEmision <= corte. */
export interface Cuota {
  id: number;
  contratoId: number;
  numero: number;
  concepto: 'canon';
  fechaEmision: ISODate;
  fechaVencimiento: ISODate;
  importe: number;
}

export interface Pago {
  id: number;
  cuotaId: number;
  contratoId: number;
  fechaPago: ISODate;
  importe: number;
  medio: 'transferencia' | 'pse' | 'consignacion' | 'cheque';
}

export interface MetaDataset {
  nombre: string;
  /** Nombre del centro comercial FICTICIO de la demostración. */
  centro: string;
  version: string;
  ficticio: true;
  semilla: number;
  moneda: 'COP';
  /** Fecha de corte (la «fecha de hoy» de la demostración). */
  fechaCorte: ISODate;
  fechaApertura: ISODate;
  aviso: string;
}

export interface Dataset {
  meta: MetaDataset;
  plantas: Planta[];
  zonas: Zona[];
  categorias: Categoria[];
  locales: Local[];
  elementos: ElementoPlano[];
  clientes: Cliente[];
  actividades: Actividad[];
  reservas: Reserva[];
  contratos: Contrato[];
  cuotas: Cuota[];
  pagos: Pago[];
}

/** Filtros de análisis sobre los locales; el resto de entidades se filtra por local. */
export interface Filtro {
  plantaId?: number;
  zonaId?: number;
  /** Uso previsto del local. */
  categoriaId?: number;
  tipoLocal?: TipoLocal;
  /** Situación contractual del local en la fecha de corte. */
  estadoContrato?: EstadoContractual;
}
