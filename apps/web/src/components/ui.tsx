import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

export function Tarjeta({
  titulo,
  subtitulo,
  accion,
  children,
  className = '',
  cuerpo = 'p-4 sm:p-5',
}: {
  titulo?: ReactNode;
  subtitulo?: ReactNode;
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
  cuerpo?: string;
}) {
  return (
    <section className={`aparecer rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}>
      {(titulo || accion) && (
        <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4 sm:px-5">
          <div>
            {titulo && <h2 className="text-[15px] font-semibold tracking-tight text-ink">{titulo}</h2>}
            {subtitulo && <p className="mt-0.5 text-xs text-muted">{subtitulo}</p>}
          </div>
          {accion}
        </header>
      )}
      <div className={cuerpo}>{children}</div>
    </section>
  );
}

export function Kpi({
  etiqueta,
  valor,
  detalle,
  ayuda,
  marca,
  destacado = false,
}: {
  etiqueta: string;
  valor: ReactNode;
  detalle?: ReactNode;
  ayuda?: string;
  marca?: string;
  destacado?: boolean;
}) {
  return (
    <div className="aparecer flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
        {marca && <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: marca }} aria-hidden />}
        <span className="truncate">{etiqueta}</span>
        {ayuda && (
          <span title={ayuda} className="ml-auto cursor-help text-muted" aria-label={ayuda}>
            <Info size={13} />
          </span>
        )}
      </div>
      <div className={`mt-2 font-semibold tracking-tight text-ink ${destacado ? 'text-3xl' : 'text-2xl'}`}>{valor}</div>
      {detalle && <div className="mt-1 text-xs text-muted">{detalle}</div>}
    </div>
  );
}

export function Leyenda({ items }: { items: { etiqueta: string; color: string; valor?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((i) => (
        <li key={i.etiqueta} className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden />
          {i.etiqueta}
          {i.valor && <span className="tabular text-muted">{i.valor}</span>}
        </li>
      ))}
    </ul>
  );
}

export function Selector<T extends string | number>({
  etiqueta,
  valor,
  opciones,
  onChange,
  ancho = 'w-40',
}: {
  etiqueta: string;
  valor: T | '';
  opciones: { valor: T | ''; texto: string }[];
  onChange: (v: T | '') => void;
  ancho?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
      {etiqueta}
      <select
        className={`${ancho} h-9 rounded-lg border border-line bg-surface px-2.5 text-sm font-normal normal-case tracking-normal text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25`}
        value={String(valor)}
        onChange={(e) => {
          const o = opciones.find((x) => String(x.valor) === e.target.value);
          onChange(o ? o.valor : '');
        }}
      >
        {opciones.map((o) => (
          <option key={String(o.valor)} value={String(o.valor)}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Segmentado<T extends string | number>({
  valor,
  opciones,
  onChange,
  etiqueta,
}: {
  valor: T;
  opciones: { valor: T; texto: string }[];
  onChange: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {opciones.map((o) => (
        <button
          key={String(o.valor)}
          role="radio"
          aria-checked={o.valor === valor}
          onClick={() => onChange(o.valor)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            o.valor === valor ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function EstadoCarga({ error }: { error?: string | null }) {
  if (error)
    return (
      <div className="rounded-xl border border-line bg-surface p-6 text-sm text-ink-2">
        No se pudieron cargar los datos: {error}
      </div>
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl border border-line bg-surface" />
      ))}
    </div>
  );
}

/** Contenedor de tooltip para Recharts con tinta del sistema. */
export function CajaTooltip({ titulo, filas }: { titulo: ReactNode; filas: { etiqueta: string; valor: string; color?: string }[] }) {
  return (
    <div className="min-w-44 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-ink">{titulo}</div>
      {filas.map((f) => (
        <div key={f.etiqueta} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-2">
            {f.color && <span className="inline-block size-2 rounded-full" style={{ background: f.color }} />}
            {f.etiqueta}
          </span>
          <span className="tabular font-medium text-ink">{f.valor}</span>
        </div>
      ))}
    </div>
  );
}

export function Insignia({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">
      {color && <span className="inline-block size-2 rounded-full" style={{ background: color }} aria-hidden />}
      {children}
    </span>
  );
}

export const ejeProps = {
  tickLine: false,
  axisLine: { stroke: 'var(--axis)' },
  tick: { fill: 'var(--muted)', fontSize: 11 },
} as const;
