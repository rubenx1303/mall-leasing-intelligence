import type { ISODate } from './types.ts';

/** Utilidades de fechas sin zona horaria (todas las operaciones en UTC). */

export function aFecha(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function aISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function sumarDias(iso: ISODate, dias: number): ISODate {
  const d = aFecha(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return aISO(d);
}

/** Suma meses conservando el día cuando existe (31 → último día del mes). */
export function sumarMeses(iso: ISODate, meses: number): ISODate {
  const d = aFecha(iso);
  const dia = d.getUTCDate();
  const objetivo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1));
  const ultimo = new Date(Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth() + 1, 0)).getUTCDate();
  objetivo.setUTCDate(Math.min(dia, ultimo));
  return aISO(objetivo);
}

export function diasEntre(desde: ISODate, hasta: ISODate): number {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86_400_000);
}

/** 'AAAA-MM' */
export function mesDe(iso: ISODate): string {
  return iso.slice(0, 7);
}

export function finDeMes(mes: string): ISODate {
  const [y, m] = mes.split('-').map(Number);
  return aISO(new Date(Date.UTC(y, m, 0)));
}

/** Lista de meses 'AAAA-MM' entre dos fechas, ambos incluidos. */
export function mesesEntre(desde: ISODate, hasta: ISODate): string[] {
  const out: string[] = [];
  let [y, m] = desde.slice(0, 7).split('-').map(Number);
  const [yf, mf] = hasta.slice(0, 7).split('-').map(Number);
  while (y < yf || (y === yf && m <= mf)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function minFecha(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxFecha(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}
