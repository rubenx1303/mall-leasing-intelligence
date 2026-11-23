import { ArrowRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Alerta, AnalisisComercial, AnalisisFinanciero, Resumen as TResumen } from '@mli/core';
import type { PropsPagina } from '../App.tsx';
import { useConsulta } from '../lib/datos.ts';
import { cop, m2, mesCorto, mesLargo, num, pct } from '../lib/formato.ts';
import { ESTADO_INFO } from '../lib/estados.ts';
import { CajaTooltip, ejeProps, EstadoCarga, Kpi, Leyenda, Tarjeta } from '../components/ui.tsx';
import { BarraInventario, GraficoSegmentos, TablaSegmentos } from '../components/graficos.tsx';
import { FilaAlerta } from './Alertas.tsx';

const ejeCop = (v: number) => (v >= 1e9 ? `${num(v / 1e9, 1)} mil M` : `${num(v / 1e6)} M`);

export function Resumen({ params, irA, abrirLocal }: PropsPagina) {
  const r = useConsulta<TResumen>('resumen', params);
  const c = useConsulta<AnalisisComercial>('comercial', params);
  const f = useConsulta<AnalisisFinanciero>('financiero', params);
  const a = useConsulta<Alerta[]>('alertas', params);

  if (!r.datos || !c.datos || !f.datos) return <EstadoCarga error={r.error ?? c.error ?? f.error} />;
  const d = r.datos;
  const fin = d.financiero;

  return (
    <div className={`space-y-5 transition-opacity ${r.cargando ? 'opacity-60' : ''}`}>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">Resumen ejecutivo</h1>
        <p className="mt-1 text-sm text-ink-2">Ocupación, rentas, cobros y vencimientos del centro a la fecha de corte. Una reserva no cuenta como ocupación.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi
          destacado
          etiqueta="Ocupación (m²)"
          marca={ESTADO_INFO.ocupado.color}
          valor={pct(d.pctOcupacion)}
          detalle={`${pct(d.pctOcupacionUnidades, 0)} de los locales · ${d.unidades.ocupados} de ${d.unidades.comercializables}`}
          ayuda="m² con contrato vigente ÷ m² comercializables. Las reservas no cuentan."
        />
        <Kpi
          destacado
          etiqueta="Renta mensual contratada"
          valor={cop(d.renta.mensual)}
          detalle={`${d.renta.porM2 ? cop(d.renta.porM2) : '—'}/m² · ${d.contratos.vigentes} contratos vigentes`}
          ayuda="Suma de la renta mensual de los contratos vigentes en el corte."
        />
        <Kpi
          destacado
          etiqueta="Ingresos facturados (12 meses)"
          valor={cop(fin.facturado12m)}
          detalle={`Cobrado del periodo ${pct(fin.tasaCobro12m)} · este mes ${cop(fin.facturadoMes)}`}
          ayuda="Recibos de renta emitidos en los últimos 12 meses. Cobro = lo pagado de esos recibos ÷ su importe."
        />
        <Kpi
          destacado
          etiqueta="Vencido sin cobrar"
          marca="var(--critical)"
          valor={cop(fin.vencido)}
          detalle={`Morosidad ${pct(fin.tasaMorosidad)} de la facturación anual`}
          ayuda="Saldo de recibos vencidos antes del corte (incluye antiguos inquilinos). Morosidad = vencido ÷ facturado 12 meses."
        />
        <Kpi
          etiqueta="Locales disponibles"
          marca={ESTADO_INFO.disponible.color}
          valor={num(d.unidades.disponibles)}
          detalle={`${m2(d.superficie.disponible)} · ${d.unidades.reservados} reservados (${cop(fin.separacionesActivas)} en separaciones)`}
        />
        <Kpi
          etiqueta="Contratos por vencer (90 días)"
          marca="var(--s2)"
          valor={num(d.contratos.porVencer90)}
          detalle={`Renta en riesgo ${cop(d.renta.enRiesgo90)}/mes · ${d.contratos.porVencer180} en 180 días`}
          ayuda="Contratos vigentes cuyo plazo termina en 90 días o menos."
        />
        <Kpi
          etiqueta="Plazo medio restante (WALT)"
          valor={d.contratos.waltMeses === null ? '—' : `${num(d.contratos.waltMeses, 1)} meses`}
          detalle="Ponderado por la renta de cada contrato"
          ayuda="Weighted Average Lease Term: meses que quedan de contrato, ponderados por renta."
        />
        <Kpi
          etiqueta="Rotación (12 meses)"
          valor={`${d.comercial.altas12m} altas · ${d.comercial.bajas12m} bajas`}
          detalle={`${d.comercial.renovaciones12m} renovaciones · tasa de renovación ${pct(d.comercial.tasaRenovacion, 0)}`}
        />
      </div>

      <Tarjeta titulo="Estado del inventario" subtitulo={`${d.unidades.total} locales · ${m2(d.superficie.total)} construidos (plano ficticio)`}>
        <BarraInventario r={d} />
      </Tarjeta>

      <div className="grid gap-4 xl:grid-cols-2">
        <Tarjeta titulo="Evolución de la ocupación" subtitulo="% de m² comercializables ocupados al cierre de cada mes">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={c.datos.evolucion.map((e) => ({ ...e, etiqueta: mesCorto(e.mes) }))} margin={{ left: -8, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="etiqueta" {...ejeProps} interval="preserveStartEnd" minTickGap={16} />
                <YAxis {...ejeProps} axisLine={false} domain={[0.5, 1]} tickFormatter={(v) => pct(v, 0)} width={48} />
                <Tooltip
                  cursor={{ stroke: 'var(--axis)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as AnalisisComercial['evolucion'][number];
                    return (
                      <CajaTooltip
                        titulo={mesLargo(p.mes)}
                        filas={[
                          { etiqueta: 'Ocupación', valor: pct(p.pctOcupacion), color: ESTADO_INFO.ocupado.color },
                          { etiqueta: 'Renta mensual', valor: cop(p.rentaMensual) },
                          { etiqueta: 'Altas / bajas', valor: `${p.altas} / ${p.bajas}` },
                          { etiqueta: 'Renovaciones', valor: num(p.renovaciones) },
                        ]}
                      />
                    );
                  }}
                />
                <Line type="monotone" dataKey="pctOcupacion" stroke={ESTADO_INFO.ocupado.color} strokeWidth={2} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Ingresos: facturado y cobrado por mes" subtitulo="Recibos de renta emitidos y pagos recibidos">
          <Leyenda
            items={[
              { etiqueta: 'Facturado', color: 'var(--s1)' },
              { etiqueta: 'Cobrado', color: ESTADO_INFO.ocupado.color },
            ]}
          />
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={f.datos.mensual.filter((m) => !m.esFuturo).map((m) => ({ ...m, etiqueta: mesCorto(m.mes) }))} margin={{ left: -4, right: 8, top: 8, bottom: 0 }} barGap={1}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="etiqueta" {...ejeProps} interval="preserveStartEnd" minTickGap={14} />
                <YAxis {...ejeProps} axisLine={false} tickFormatter={ejeCop} width={56} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as AnalisisFinanciero['mensual'][number];
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
                <Bar dataKey="facturado" fill="var(--s1)" radius={[3, 3, 0, 0]} maxBarSize={12} isAnimationActive={false} />
                <Bar dataKey="cobrado" fill={ESTADO_INFO.ocupado.color} radius={[3, 3, 0, 0]} maxBarSize={12} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Comparación por plantas" cuerpo="p-0 pt-2">
        <TablaSegmentos filas={c.datos.porPlanta} />
      </Tarjeta>

      <div className="grid gap-4 xl:grid-cols-5">
        <Tarjeta className="xl:col-span-3" titulo="Ocupación por zona" subtitulo="m² por estado; a la derecha, % de m² ocupados">
          <GraficoSegmentos filas={c.datos.porZona} />
        </Tarjeta>
        <Tarjeta
          className="xl:col-span-2"
          titulo="Alertas prioritarias"
          subtitulo={a.datos ? `${a.datos.length} alertas activas` : ' '}
          accion={
            <button onClick={() => irA('alertas')} className="flex items-center gap-1 text-xs font-medium text-accent-ink hover:underline">
              Ver todas <ArrowRight size={13} />
            </button>
          }
          cuerpo="px-2 pb-2 pt-1"
        >
          <ul className="divide-y divide-[var(--border)]">
            {(a.datos ?? []).slice(0, 7).map((x) => (
              <FilaAlerta key={x.id} a={x} compacta abrirLocal={abrirLocal} />
            ))}
          </ul>
        </Tarjeta>
      </div>
    </div>
  );
}
