import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalisisFinanciero, Resumen } from '@mli/core';
import type { PropsPagina } from '../App.tsx';
import { useConsulta } from '../lib/datos.ts';
import { cop, fecha, mesCorto, mesLargo, millones, num, pct } from '../lib/formato.ts';
import { ESTADO_INFO } from '../lib/estados.ts';
import { CajaTooltip, ejeProps, EstadoCarga, Insignia, Kpi, Leyenda, Tarjeta } from '../components/ui.tsx';

const eje = (v: number) => (v >= 1e9 ? `${num(v / 1e9, 1)} mil M` : `${num(v / 1e6)} M`);

export function Financiero({ params, abrirLocal }: PropsPagina) {
  const f = useConsulta<AnalisisFinanciero>('financiero', params);
  const r = useConsulta<Resumen>('resumen', params);
  if (!f.datos || !r.datos) return <EstadoCarga error={f.error ?? r.error} />;
  const d = f.datos;
  const k = r.datos.financiero;
  const pasado = d.mensual.filter((m) => !m.esFuturo).map((m) => ({ ...m, etiqueta: mesCorto(m.mes) }));
  const futuro = d.mensual.filter((m) => m.esFuturo).map((m) => ({ ...m, etiqueta: mesCorto(m.mes) }));

  return (
    <div className={`space-y-5 transition-opacity ${f.cargando ? 'opacity-60' : ''}`}>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">Ingresos y cobros</h1>
        <p className="mt-1 text-sm text-ink-2">Renta facturada (recibos emitidos), importes realmente cobrados, deuda vencida y previsión de ingresos.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi etiqueta="Facturado (12 meses)" valor={cop(k.facturado12m)} detalle={`Total desde la apertura ${cop(k.facturadoTotal)}`} />
        <Kpi etiqueta="Cobrado (12 meses)" marca={ESTADO_INFO.ocupado.color} valor={cop(k.cobrado12m)} detalle={`Tasa de cobro de los recibos del periodo ${pct(k.tasaCobro12m)}`} />
        <Kpi
          etiqueta="Vencido sin cobrar"
          marca="var(--critical)"
          valor={cop(k.vencido)}
          detalle={`Morosidad ${pct(k.tasaMorosidad)} · ${d.deudores.length} contratos`}
          ayuda="Saldo de recibos cuyo vencimiento es anterior al corte. Morosidad = vencido ÷ facturado de los últimos 12 meses."
        />
        <Kpi etiqueta="Pendiente de cobro" valor={cop(k.pendienteCobro)} detalle="Facturado − cobrado (incluye recibos aún no vencidos)" />
      </div>

      <Tarjeta titulo="Facturado y cobrado por mes" subtitulo="Desde la apertura del centro (millones de COP)">
        <Leyenda
          items={[
            { etiqueta: 'Facturado', color: 'var(--s1)' },
            { etiqueta: 'Cobrado', color: ESTADO_INFO.ocupado.color },
          ]}
        />
        <div className="mt-3 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pasado} margin={{ left: -4, right: 8, top: 8, bottom: 0 }} barGap={1}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="etiqueta" {...ejeProps} interval="preserveStartEnd" minTickGap={10} />
              <YAxis {...ejeProps} axisLine={false} tickFormatter={eje} width={56} />
              <Tooltip
                cursor={{ fill: 'var(--surface-2)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as (typeof pasado)[number];
                  return (
                    <CajaTooltip
                      titulo={mesLargo(p.mes)}
                      filas={[
                        { etiqueta: 'Facturado', valor: cop(p.facturado), color: 'var(--s1)' },
                        { etiqueta: 'Cobrado', valor: cop(p.cobrado), color: ESTADO_INFO.ocupado.color },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="facturado" fill="var(--s1)" radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive={false} />
              <Bar dataKey="cobrado" fill={ESTADO_INFO.ocupado.color} radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Tarjeta>

      <div className="grid gap-4 xl:grid-cols-2">
        <Tarjeta titulo="Previsión de ingresos" subtitulo="Recibos de los contratos firmados que se emitirán en los próximos 12 meses">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={futuro} margin={{ left: -4, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="etiqueta" {...ejeProps} interval={0} fontSize={10} />
                <YAxis {...ejeProps} axisLine={false} tickFormatter={eje} width={56} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof futuro)[number];
                    return <CajaTooltip titulo={mesLargo(p.mes)} filas={[{ etiqueta: 'Renta prevista', valor: cop(p.previsto), color: 'var(--s1)' }]} />;
                  }}
                />
                <Bar dataKey="previsto" fill="var(--s1)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted">Baja a medida que vencen contratos sin renovar: es la renta que hay que recolocar.</p>
        </Tarjeta>

        <Tarjeta titulo="Antigüedad de la deuda vencida" subtitulo="Saldo por días de atraso (millones de COP)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.antiguedad.map((a) => ({ ...a, texto: a.importe ? millones(a.importe) : '' }))} margin={{ left: -4, right: 8, top: 22, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="tramo" {...ejeProps} interval={0} fontSize={10} />
                <YAxis {...ejeProps} axisLine={false} tickFormatter={eje} width={56} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as AnalisisFinanciero['antiguedad'][number];
                    return (
                      <CajaTooltip
                        titulo={p.tramo}
                        filas={[
                          { etiqueta: 'Saldo vencido', valor: cop(p.importe) },
                          { etiqueta: 'Recibos', valor: num(p.cuotas) },
                        ]}
                      />
                    );
                  }}
                />
                <Bar dataKey="importe" fill="var(--s2)" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                  <LabelList dataKey="texto" position="top" fill="var(--ink-2)" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Tarjeta>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Tarjeta className="xl:col-span-3" titulo="Inquilinos con deuda vencida" cuerpo="p-0 pt-2">
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="sticky top-0 border-b border-line bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Contrato</th>
                  <th className="px-3 py-2.5 font-medium">Local · inquilino (ficticio)</th>
                  <th className="px-3 py-2.5 text-right font-medium">Recibos</th>
                  <th className="px-3 py-2.5 text-right font-medium">Atraso máx.</th>
                  <th className="px-5 py-2.5 text-right font-medium">Vencido</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {d.deudores.map((x) => (
                  <tr key={x.contrato} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2" onClick={() => abrirLocal(x.localCodigo)}>
                    <td className="px-5 py-2.5 text-ink">
                      {x.contrato} {x.estadoContrato !== 'vigente' && <Insignia>{x.estadoContrato}</Insignia>}
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">
                      <span className="text-ink">{x.localCodigo}</span> · {x.inquilino}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink-2">{x.cuotasVencidas}</td>
                    <td className={`px-3 py-2.5 text-right ${x.diasMaxAtraso > 60 ? 'font-medium text-[var(--critical)]' : 'text-ink-2'}`}>{x.diasMaxAtraso} días</td>
                    <td className="px-5 py-2.5 text-right font-medium text-ink">{cop(x.vencido)}</td>
                  </tr>
                ))}
                {!d.deudores.length && (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-muted">
                      Sin deuda vencida.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Tarjeta>
        <Tarjeta className="xl:col-span-2" titulo="Recibos que vencen en 30 días" cuerpo="p-0 pt-2">
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-line bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Vence</th>
                  <th className="px-3 py-2.5 font-medium">Local</th>
                  <th className="px-5 py-2.5 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {d.proximosRecibos.map((x, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-5 py-2 text-ink">{fecha(x.fechaVencimiento)}</td>
                    <td className="px-3 py-2 text-ink-2" title={x.inquilino}>
                      {x.localCodigo}
                    </td>
                    <td className="px-5 py-2 text-right text-ink">{cop(x.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}
