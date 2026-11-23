import { useMemo, useRef, useState } from 'react';
import type { Categoria, ElementoPlano, LocalVista, Planta } from '@mli/core';
import { CONTRATO_INFO, ESTADO_INFO, GRUPO_COLOR } from '../lib/estados.ts';
import { cop, fecha, m2 } from '../lib/formato.ts';

export type ModoColor = 'estado' | 'actividad' | 'contrato';

interface Props {
  planta: Planta;
  locales: LocalVista[];
  elementos: ElementoPlano[];
  categorias: Categoria[];
  modoColor: ModoColor;
  /** Devuelve si el local cumple los filtros activos (los demás se atenúan). */
  coincide: (l: LocalVista) => boolean;
  resaltado?: string | null;
  onSelect: (codigo: string) => void;
}

const M = 24; // margen del lienzo

export function Plano({ planta, locales, elementos, categorias, modoColor, coincide, resaltado, onSelect }: Props) {
  const [hover, setHover] = useState<{ l: LocalVista; x: number; y: number } | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const grupoDe = useMemo(() => new Map(categorias.map((c) => [c.id, c.grupo])), [categorias]);

  const relleno = (l: LocalVista) => {
    if (l.estado === 'no_comercializable') return ESTADO_INFO.no_comercializable.color;
    if (modoColor === 'estado') return ESTADO_INFO[l.estado].color;
    if (modoColor === 'contrato') return CONTRATO_INFO[l.estadoContrato].color;
    const g = l.categoriaId ? grupoDe.get(l.categoriaId) : undefined;
    return g ? GRUPO_COLOR[g] : ESTADO_INFO.no_comercializable.color;
  };
  const tinta = (l: LocalVista) => {
    if (l.estado === 'no_comercializable') return 'var(--ink-2)';
    const fondoAmarillo = modoColor === 'estado' ? l.estado === 'reservado' : grupoDe.get(l.categoriaId ?? 0) === 'Ocio';
    return fondoAmarillo ? '#0b0b0b' : '#ffffff';
  };

  const mover = (e: React.MouseEvent, l: LocalVista) => {
    const r = caja.current?.getBoundingClientRect();
    if (!r) return;
    setHover({ l, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  return (
    <div className="-mx-1 overflow-x-auto px-1">
    <div ref={caja} className="relative min-w-[640px]">
      <svg
        viewBox={`${-M} ${-M} ${planta.ancho + 2 * M} ${planta.alto + 2 * M + 26}`}
        className="h-auto w-full select-none"
        role="group"
        aria-label={`Plano ficticio de ${planta.nombre}`}
      >
        {/* Envolvente del edificio */}
        <rect x={6} y={6} width={planta.ancho - 12} height={planta.alto - 12} rx={10} fill="var(--surface-2)" stroke="var(--axis)" strokeWidth={2} />

        {elementos
          .filter((e) => e.plantaId === planta.id)
          .map((e, i) => (
            <g key={i}>
              <rect
                x={e.x}
                y={e.y}
                width={e.w}
                height={e.h}
                fill={e.tipo === 'plaza' || e.tipo === 'terraza' ? 'var(--surface)' : 'var(--plane)'}
                stroke={e.tipo === 'plaza' || e.tipo === 'terraza' ? 'var(--axis)' : 'none'}
                strokeDasharray={e.tipo === 'plaza' || e.tipo === 'terraza' ? '6 5' : undefined}
                rx={4}
              />
              {e.etiqueta && (
                <text
                  x={e.x + e.w / 2}
                  y={e.y + e.h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={e.tipo === 'circulacion' ? 13 : 12}
                  letterSpacing={e.tipo === 'circulacion' ? 4 : 0.5}
                  fill="var(--muted)"
                  style={{ textTransform: 'uppercase' }}
                  transform={e.h > e.w * 1.6 ? `rotate(-90 ${e.x + e.w / 2} ${e.y + e.h / 2})` : undefined}
                >
                  {e.etiqueta}
                </text>
              )}
            </g>
          ))}

        {locales.map((l) => {
          const activo = coincide(l);
          const esResaltado = resaltado === l.codigo;
          const corto = l.codigo.replace(/^P\d-/, '');
          const grande = l.w >= 70 && l.h >= 60;
          const fs = l.w < 45 ? 12 : l.w < 70 ? 13 : 15;
          return (
            <g
              key={l.codigo}
              role="button"
              tabIndex={0}
              aria-label={`${l.codigo}, ${ESTADO_INFO[l.estado].etiqueta}, ${m2(l.areaM2)}`}
              onClick={() => onSelect(l.codigo)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(l.codigo)}
              onMouseMove={(e) => mover(e, l)}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[var(--ink)]"
              style={{ opacity: activo ? 1 : 0.16, transition: 'opacity .25s' }}
            >
              <rect
                x={l.x + 1.5}
                y={l.y + 1.5}
                width={l.w - 3}
                height={l.h - 3}
                rx={4}
                fill={relleno(l)}
                stroke={esResaltado || hover?.l.codigo === l.codigo ? 'var(--ink)' : 'var(--surface)'}
                strokeWidth={esResaltado || hover?.l.codigo === l.codigo ? 4 : 2}
              />
              {l.tipo === 'ancla' ? (
                <>
                  <text x={l.x + l.w / 2} y={l.y + l.h / 2 - 14} textAnchor="middle" fontSize={16} fontWeight={600} fill={tinta(l)}>
                    {corto}
                  </text>
                  <text x={l.x + l.w / 2} y={l.y + l.h / 2 + 8} textAnchor="middle" fontSize={12} fill={tinta(l)} opacity={0.9}>
                    {l.categoria}
                  </text>
                  <text x={l.x + l.w / 2} y={l.y + l.h / 2 + 26} textAnchor="middle" fontSize={12} fill={tinta(l)} opacity={0.9}>
                    {m2(l.areaM2)}
                  </text>
                </>
              ) : (
                <>
                  <text
                    x={l.x + l.w / 2}
                    y={l.y + l.h / 2 + (grande ? -6 : 0)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={fs}
                    fontWeight={600}
                    fill={tinta(l)}
                  >
                    {l.w < 45 ? corto.slice(-2) : corto}
                  </text>
                  {grande && (
                    <text x={l.x + l.w / 2} y={l.y + l.h / 2 + 12} textAnchor="middle" dominantBaseline="middle" fontSize={11} fill={tinta(l)} opacity={0.9}>
                      {Math.round(l.areaM2)} m²
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}

        {/* Escala y norte */}
        <g transform={`translate(10 ${planta.alto + 16})`} fill="var(--muted)" fontSize={11}>
          <rect x={0} y={0} width={100} height={5} fill="var(--ink-2)" />
          <rect x={100} y={0} width={100} height={5} fill="var(--axis)" />
          <text x={0} y={20}>0</text>
          <text x={96} y={20}>10</text>
          <text x={192} y={20}>20 m</text>
        </g>
        <g transform={`translate(${planta.ancho - 20} ${planta.alto + 14})`} fill="var(--ink-2)" fontSize={11}>
          <path d="M0 -8 L6 8 L0 4 L-6 8 Z" />
          <text x={12} y={6}>N</text>
        </g>
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-60 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(hover.x + 14, (caja.current?.clientWidth ?? 0) - 250),
            top: hover.y + 14,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-ink">{hover.l.codigo}</span>
            <span className="flex items-center gap-1.5 text-ink-2">
              <span className="inline-block size-2 rounded-full" style={{ background: ESTADO_INFO[hover.l.estado].color }} />
              {ESTADO_INFO[hover.l.estado].etiqueta}
            </span>
          </div>
          <div className="mt-1 text-ink-2">
            {hover.l.zona} · {m2(hover.l.areaM2)}
          </div>
          <div className="text-ink-2">{hover.l.descripcion ?? hover.l.categoria}</div>
          {hover.l.inquilino && <div className="mt-1 text-ink">{hover.l.inquilino}</div>}
          {hover.l.contrato && (
            <div className="text-ink-2">
              Renta {cop(hover.l.contrato.canonMensual)}/mes · fin {fecha(hover.l.contrato.fechaFin)} ({hover.l.contrato.diasRestantes} días)
            </div>
          )}
          {hover.l.reserva && (
            <div className="text-ink-2">
              Reserva vence {fecha(hover.l.reserva.fechaVencimiento)} ({hover.l.reserva.diasRestantes} días)
            </div>
          )}
          {hover.l.diasVacio !== null && <div className="text-ink-2">Vacío desde hace {hover.l.diasVacio} días · lista {cop(hover.l.rentaLista)}/mes</div>}
          {hover.l.vencido > 0 && <div className="font-medium text-[var(--critical)]">Deuda vencida {cop(hover.l.vencido)}</div>}
        </div>
      )}
    </div>
    </div>
  );
}
