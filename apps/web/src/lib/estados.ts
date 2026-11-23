import type { EstadoComercial, EstadoContractual } from '@mli/core';

export const ESTADO_INFO: Record<EstadoComercial, { etiqueta: string; corta: string; color: string }> = {
  ocupado: { etiqueta: 'Ocupado', corta: 'Ocupado', color: 'var(--st-ocupado)' },
  reservado: { etiqueta: 'Reservado', corta: 'Reservado', color: 'var(--st-reservado)' },
  disponible: { etiqueta: 'Disponible', corta: 'Disponible', color: 'var(--st-disponible)' },
  no_comercializable: { etiqueta: 'No comercializable', corta: 'No comerc.', color: 'var(--st-nocom)' },
};

/** Orden de lectura: de lo que genera renta a lo que no. */
export const ORDEN_ESTADOS: EstadoComercial[] = ['ocupado', 'reservado', 'disponible', 'no_comercializable'];

export const CONTRATO_INFO: Record<EstadoContractual, { etiqueta: string; color: string }> = {
  vigente: { etiqueta: 'Contrato vigente', color: 'var(--st-ocupado)' },
  por_vencer: { etiqueta: 'Vence en ≤ 90 días', color: 'var(--s2)' },
  sin_contrato: { etiqueta: 'Sin contrato', color: 'var(--st-nocom)' },
};

/** Colores por grupo de actividad (orden fijo de series). */
export const GRUPO_COLOR: Record<string, string> = {
  Comercio: 'var(--s1)',
  Restauración: 'var(--s2)',
  Servicios: 'var(--s3)',
  Ocio: 'var(--s4)',
  Ancla: 'var(--s5)',
};

export const TIPO_LOCAL: Record<string, string> = {
  ancla: 'Ancla',
  local: 'Local',
  isla: 'Isla',
  tecnico: 'Técnico / servicio',
};
