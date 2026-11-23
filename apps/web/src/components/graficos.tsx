import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FilaSegmento, Resumen } from '@mli/core';
import { ESTADO_INFO } from '../lib/estados.ts';
import { cop, m2, num, pct } from '../lib/formato.ts';
import { CajaTooltip, ejeProps, Leyenda } from './ui.tsx';

/** Barra segmentada del inventario (m²) por estado, con 2 px de separación entre tramos. */
export function BarraInventario({ r }: { r: Resumen }) {
  const total = r.superficie.total || 1;
  const tramos = [
    { k: 'ocupado' as const, m: r.superficie.ocupada, n: r.unidades.ocupados },
    { k: 'reservado' as const, m: r.superficie.reservada, n: r.unidades.reservados },
    { k: 'disponible' as const, m: r.superficie.disponible, n: r.unidades.disponibles },
    { k: 'no_comercializable' as const, m: r.superficie.total - r.superficie.comercializable, n: r.unidades.noComercializables },
  ].filter((t) => t.m > 0);
  return (
    <div>
      <div className="flex h-9 w-full gap-[2px] overflow-hidden rounded-md" role="img" aria-label="Superficie por estado">
        {tramos.map((t) => (
          <div
            key={t.k}
            title={`${ESTADO_INFO[t.k].etiqueta}: ${m2(t.m)} · ${t.n} locales`}
            className="h-full transition-[flex-grow] duration-500"
            style={{ flexGrow: t.m / total, background: ESTADO_INFO[t.k].color }}
          />
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tramos.map((t) => (
          <div key={t.k} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs text-ink-2">
              <span className="inline-block size-2.5 rounded-[3px]" style={{ background: ESTADO_INFO[t.k].color }} />
              {ESTADO_INFO[t.k].etiqueta}
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular text-ink">{t.n} {t.n === 1 ? "local" : "locales"}</dd>
            <dd className="text-xs text-muted">
              {m2(t.m)} · {pct(t.m / total)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** m² por estado apilados, por zona o planta (barras horizontales), con el % de ocupación a la derecha. */
export function GraficoSegmentos({ filas, alto = 320 }: { filas: FilaSegmento[]; alto?: number }) {
  const datos = [...filas]
    .sort((a, b) => (b.pctOcupacion ?? 0) - (a.pctOcupacion ?? 0))
    .map((z) => ({
      nombre: z.clave.startsWith('Z') ? `${z.nombre} · P${z.planta.slice(-1)}` : z.nombre,
      ocupado: z.areaOcupada,
      reservado: z.areaReservada,
      disponible: z.areaDisponible,
      pctTexto: pct(z.pctOcupacion, 0),
      z,
    }));
  const series = [
    { k: 'ocupado', est: 'ocupado' as const },
    { k: 'reservado', est: 'reservado' as const },
    { k: 'disponible', est: 'disponible' as const },
  ];
  return (
    <div>
      <Leyenda items={series.map((s) => ({ etiqueta: ESTADO_INFO[s.est].etiqueta, color: ESTADO_INFO[s.est].color }))} />
      <div style={{ height: Math.max(alto, datos.length * 30 + 40) }} className="mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} layout="vertical" margin={{ left: 0, right: 4, top: 4, bottom: 4 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" {...ejeProps} tickFormatter={(v) => num(v)} unit=" m²" />
            <YAxis type="category" dataKey="nombre" width={196} {...ejeProps} axisLine={false} />
            {/* Etiqueta directa del % (eje de categorías a la derecha, no una segunda escala) */}
            <YAxis yAxisId="pct" type="category" dataKey="pctTexto" orientation="right" width={44} tickLine={false} axisLine={false} tick={{ fill: 'var(--ink-2)', fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: 'var(--surface-2)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof datos)[number];
                return (
                  <CajaTooltip
                    titulo={d.nombre}
                    filas={[
                      { etiqueta: 'Ocupado', valor: `${m2(d.ocupado)} · ${d.z.ocupados} loc.`, color: ESTADO_INFO.ocupado.color },
                      { etiqueta: 'Reservado', valor: `${m2(d.reservado)} · ${d.z.reservados} loc.`, color: ESTADO_INFO.reservado.color },
                      { etiqueta: 'Disponible', valor: `${m2(d.disponible)} · ${d.z.disponibles} loc.`, color: ESTADO_INFO.disponible.color },
                      { etiqueta: 'Ocupación', valor: pct(d.z.pctOcupacion) },
                      { etiqueta: 'Renta mensual', valor: cop(d.z.rentaMensual) },
                    ]}
                  />
                );
              }}
            />
            {series.map((s, i) => (
              <Bar
                key={s.k}
                dataKey={s.k}
                stackId="a"
                fill={ESTADO_INFO[s.est].color}
                stroke="var(--surface)"
                strokeWidth={2}
                radius={i === series.length - 1 ? [0, 4, 4, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Tabla comparativa de segmentos (plantas o zonas). */
export function TablaSegmentos({ filas }: { filas: FilaSegmento[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-line text-left text-xs text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">Segmento</th>
            <th className="px-3 py-2.5 text-right font-medium">Ocupación</th>
            <th className="px-3 py-2.5 text-right font-medium">Ocupados / total</th>
            <th className="px-3 py-2.5 text-right font-medium">Renta mensual</th>
            <th className="px-3 py-2.5 text-right font-medium">Renta / m²</th>
            <th className="px-3 py-2.5 text-right font-medium">Vence ≤ 90 d</th>
            <th className="px-4 py-2.5 text-right font-medium">Vencido</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {filas.map((f) => (
            <tr key={f.clave} className="border-b border-line last:border-0">
              <td className="px-4 py-2.5 text-ink">
                {f.nombre}
                {f.clave.startsWith('Z') && <span className="text-muted"> · {f.planta}</span>}
              </td>
              <td className="px-3 py-2.5 text-right font-medium text-ink">{pct(f.pctOcupacion, 0)}</td>
              <td className="px-3 py-2.5 text-right text-ink-2">
                {f.ocupados} / {f.comercializables}
              </td>
              <td className="px-3 py-2.5 text-right text-ink">{cop(f.rentaMensual)}</td>
              <td className="px-3 py-2.5 text-right text-ink-2">{f.rentaM2 ? cop(f.rentaM2) : '—'}</td>
              <td className="px-3 py-2.5 text-right text-ink-2">{f.porVencer90 || '—'}</td>
              <td className={`px-4 py-2.5 text-right ${f.vencido > 0 ? 'font-medium text-[var(--critical)]' : 'text-muted'}`}>
                {f.vencido > 0 ? cop(f.vencido) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
