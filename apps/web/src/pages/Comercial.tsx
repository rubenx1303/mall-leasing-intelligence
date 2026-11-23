import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalisisComercial, Resumen } from '@mli/core';
import type { PropsPagina } from '../App.tsx';
import { useConsulta } from '../lib/datos.ts';
import { cop, fecha, m2, mesCorto, mesLargo, num, pct } from '../lib/formato.ts';
import { ESTADO_INFO } from '../lib/estados.ts';
import { CajaTooltip, ejeProps, EstadoCarga, Kpi, Leyenda, Segmentado, Tarjeta } from '../components/ui.tsx';
import { GraficoSegmentos, TablaSegmentos } from '../components/graficos.tsx';

export function Comercial({ params, abrirLocal }: PropsPagina) {
  const c = useConsulta<AnalisisComercial>('comercial', params);
  const r = useConsulta<Resumen>('resumen', params);
  const [horizonte, setHorizonte] = useState<90 | 180 | 365>(180);
  if (!c.datos || !r.datos) return <EstadoCarga error={c.error ?? r.error} />;
  const d = c.datos;
  const k = r.datos;
  const meses = d.evolucion.map((e) => ({ ...e, etiqueta: mesCorto(e.mes), bajasNeg: -e.bajas }));
  const venc = d.vencimientos.filter((v) => v.diasRestantes <= horizonte);

  return (
    <div className={`space-y-5 transition-opacity ${c.cargando ? 'opacity-60' : ''}`}>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">Ocupación y contratos</h1>
        <p className="mt-1 text-sm text-ink-2">Vencimientos, rotación de inquilinos, rendimiento por zona y demanda de los locales vacíos.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi etiqueta="Contratos vigentes" valor={num(k.contratos.vigentes)} detalle={`WALT ${num(k.contratos.waltMeses, 1)} meses`} />
        <Kpi
          etiqueta="Tasa de renovación"
          valor={pct(k.comercial.tasaRenovacion, 0)}
          detalle="Contratos que llegaron a su fin y se renovaron"
          ayuda="Renovados ÷ contratos terminados por fin de plazo (sin contar rescisiones)."
        />
        <Kpi
          etiqueta="Tiempo medio vacío"
          valor={k.comercial.tiempoMedioVacioDias === null ? '—' : `${num(k.comercial.tiempoMedioVacioDias)} días`}
          detalle="Desde que un local queda libre hasta el siguiente contrato"
        />
        <Kpi
          etiqueta="Conversión de reservas"
          valor={pct(k.comercial.conversionReservas, 0)}
          detalle={`${k.comercial.interesados12m} interesados en 12 meses · descuento medio ${pct(k.comercial.descuentoMedio)}`}
        />
      </div>

      <Tarjeta
        titulo="Contratos próximos a vencer"
        subtitulo="Ordenados por días hasta el fin del plazo; pulsa una fila para ver el local"
        accion={
          <Segmentado
            etiqueta="Horizonte"
            valor={horizonte}
            onChange={setHorizonte}
            opciones={[
              { valor: 90, texto: '90 días' },
              { valor: 180, texto: '180 días' },
              { valor: 365, texto: '12 meses' },
            ]}
          />
        }
        cuerpo="p-0 pt-3"
      >
        <div className="max-h-96 overflow-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 border-b border-line bg-surface text-left text-xs text-muted">
              <tr>
                <th className="px-5 py-2.5 font-medium">Contrato</th>
                <th className="px-3 py-2.5 font-medium">Local</th>
                <th className="px-3 py-2.5 font-medium">Inquilino (ficticio)</th>
                <th className="px-3 py-2.5 font-medium">Fin</th>
                <th className="px-3 py-2.5 text-right font-medium">Días</th>
                <th className="px-3 py-2.5 text-right font-medium">Renta mensual</th>
                <th className="px-5 py-2.5 text-right font-medium">Deuda vencida</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {venc.map((v) => (
                <tr key={v.contrato} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2" onClick={() => abrirLocal(v.localCodigo)}>
                  <td className="px-5 py-2.5 text-ink">{v.contrato}</td>
                  <td className="px-3 py-2.5 text-ink">
                    {v.localCodigo} <span className="text-muted">· {v.zona}</span>
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">{v.inquilino}</td>
                  <td className="px-3 py-2.5 text-ink-2">{fecha(v.fechaFin)}</td>
                  <td className={`px-3 py-2.5 text-right font-medium ${v.diasRestantes <= 30 ? 'text-[var(--critical)]' : v.diasRestantes <= 90 ? 'text-ink' : 'text-ink-2'}`}>
                    {v.diasRestantes}
                  </td>
                  <td className="px-3 py-2.5 text-right text-ink">{cop(v.canonMensual)}</td>
                  <td className={`px-5 py-2.5 text-right ${v.vencidoInquilino > 0 ? 'font-medium text-[var(--critical)]' : 'text-muted'}`}>
                    {v.vencidoInquilino > 0 ? cop(v.vencidoInquilino) : 'Al día'}
                  </td>
                </tr>
              ))}
              {!venc.length && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-muted">
                    Ningún contrato vence en este horizonte con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <div className="grid gap-4 xl:grid-cols-2">
        <Tarjeta titulo="Calendario de vencimientos" subtitulo="Renta mensual de los contratos que terminan cada mes (próximos 12 meses)">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.calendarioVencimientos.map((m) => ({ ...m, etiqueta: mesCorto(m.mes), texto: m.contratos ? `${m.contratos}` : '' }))} margin={{ left: -4, right: 8, top: 18, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="etiqueta" {...ejeProps} interval={0} fontSize={10} />
                <YAxis {...ejeProps} axisLine={false} tickFormatter={(v) => `${num(v / 1e6)} M`} width={52} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as AnalisisComercial['calendarioVencimientos'][number];
                    return (
                      <CajaTooltip
                        titulo={mesLargo(p.mes)}
                        filas={[
                          { etiqueta: 'Contratos que vencen', valor: num(p.contratos) },
                          { etiqueta: 'Renta mensual afectada', valor: cop(p.rentaMensual), color: 'var(--s2)' },
                        ]}
                      />
                    );
                  }}
                />
                <Bar dataKey="rentaMensual" fill="var(--s2)" radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={false}>
                  <LabelList dataKey="texto" position="top" fill="var(--ink-2)" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted">La cifra sobre cada barra es el número de contratos.</p>
        </Tarjeta>

        <Tarjeta titulo="Rotación mensual" subtitulo="Nuevos contratos (altas) y salidas sin renovación (bajas)">
          <Leyenda
            items={[
              { etiqueta: 'Altas', color: ESTADO_INFO.ocupado.color },
              { etiqueta: 'Bajas', color: 'var(--s2)' },
            ]}
          />
          <div className="mt-3 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={meses} margin={{ left: -14, right: 8, top: 8, bottom: 0 }} stackOffset="sign">
                <CartesianGrid vertical={false} />
                <XAxis dataKey="etiqueta" {...ejeProps} interval="preserveStartEnd" minTickGap={14} />
                <YAxis {...ejeProps} axisLine={false} allowDecimals={false} width={40} tickFormatter={(v) => num(Math.abs(v))} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof meses)[number];
                    return (
                      <CajaTooltip
                        titulo={mesLargo(p.mes)}
                        filas={[
                          { etiqueta: 'Altas', valor: num(p.altas), color: ESTADO_INFO.ocupado.color },
                          { etiqueta: 'Bajas', valor: num(p.bajas), color: 'var(--s2)' },
                          { etiqueta: 'Renovaciones', valor: num(p.renovaciones) },
                          { etiqueta: 'Ocupación al cierre', valor: pct(p.pctOcupacion) },
                        ]}
                      />
                    );
                  }}
                />
                <Bar dataKey="altas" stackId="r" fill={ESTADO_INFO.ocupado.color} radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive={false} />
                <Bar dataKey="bajasNeg" stackId="r" fill="var(--s2)" radius={[0, 0, 3, 3]} maxBarSize={14} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Rendimiento por zona" cuerpo="p-0 pt-2">
        <TablaSegmentos filas={[...d.porZona].sort((a, b) => (b.pctOcupacion ?? 0) - (a.pctOcupacion ?? 0))} />
      </Tarjeta>

      <div className="grid gap-4 xl:grid-cols-5">
        <Tarjeta className="xl:col-span-3" titulo="Ocupación por zona" subtitulo="m² por estado">
          <GraficoSegmentos filas={d.porZona} alto={300} />
        </Tarjeta>
        <Tarjeta className="xl:col-span-2" titulo="Mezcla comercial alquilada" subtitulo="Reparto de los m² ocupados por actividad">
          <ul className="space-y-2.5">
            {d.mezcla.map((x) => (
              <li key={x.categoriaId}>
                <div className="flex justify-between gap-2 text-xs">
                  <span className="truncate text-ink">{x.nombre}</span>
                  <span className="shrink-0 tabular text-ink-2">
                    {m2(x.m2)} · {pct(x.pct, 0)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-[var(--s1)]" style={{ width: `${x.pct * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Tarjeta titulo="Actividades: demanda y ocupación" subtitulo="Interesados en 12 meses (locales vacíos) y contratos vigentes por actividad" cuerpo="p-0 pt-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Actividad</th>
                  <th className="px-3 py-2.5 text-right font-medium">Interesados</th>
                  <th className="px-3 py-2.5 text-right font-medium">Contratos</th>
                  <th className="px-5 py-2.5 text-right font-medium">Renta mensual</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {d.porCategoria.map((x) => (
                  <tr key={x.categoriaId} className="border-b border-line last:border-0">
                    <td className="px-5 py-2 text-ink">{x.nombre}</td>
                    <td className="px-3 py-2 text-right text-ink-2">{x.interesados12m}</td>
                    <td className="px-3 py-2 text-right text-ink-2">{x.contratosVigentes}</td>
                    <td className="px-5 py-2 text-right text-ink">{cop(x.rentaMensual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
        <Tarjeta titulo="Reservas activas" subtitulo="Locales vacíos con una reserva en curso (aún sin contrato)" cuerpo="p-0 pt-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Local</th>
                  <th className="px-3 py-2.5 font-medium">Interesado (ficticio)</th>
                  <th className="px-3 py-2.5 font-medium">Vence</th>
                  <th className="px-5 py-2.5 text-right font-medium">Separación</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {d.reservasActivas.map((x) => (
                  <tr key={x.codigo} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2" onClick={() => abrirLocal(x.localCodigo)}>
                    <td className="px-5 py-2 text-ink">
                      {x.localCodigo} <span className="text-muted">· {x.zona}</span>
                    </td>
                    <td className="px-3 py-2 text-ink-2">{x.interesado}</td>
                    <td className={`px-3 py-2 ${x.diasRestantes <= 15 ? 'font-medium text-[var(--critical)]' : 'text-ink-2'}`}>
                      {fecha(x.fechaVencimiento)} ({x.diasRestantes} d)
                    </td>
                    <td className="px-5 py-2 text-right text-ink">{cop(x.importeSeparacion)}</td>
                  </tr>
                ))}
                {!d.reservasActivas.length && (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-center text-muted">
                      No hay reservas activas con estos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}
