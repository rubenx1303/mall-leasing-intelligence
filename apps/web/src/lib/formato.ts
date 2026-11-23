const nf0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Importe compacto en COP: «$ 40,3 mil M», «$ 143,2 M», «$ 950.000». */
export function cop(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e9) return `${s}$ ${nf1.format(a / 1e9)} mil M`;
  if (a >= 1e6) return `${s}$ ${nf1.format(a / 1e6)} M`;
  return `${s}$ ${nf0.format(a)}`;
}

/** Importe en millones con separadores, para tablas: «143,2». */
export function millones(v: number): string {
  return nf1.format(v / 1e6);
}

export function pct(v: number | null | undefined, dec = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${new Intl.NumberFormat('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v * 100)} %`;
}

export function num(v: number | null | undefined, dec = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: dec, minimumFractionDigits: 0 }).format(v);
}

export function m2(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${num(v)} m²`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}

/** 'AAAA-MM' → «mar 26» */
export function mesCorto(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} ${String(y).slice(2)}`;
}

export function mesLargo(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}
