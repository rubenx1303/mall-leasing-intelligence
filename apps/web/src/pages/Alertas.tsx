import { useState } from 'react';
import { AlertOctagon, AlertTriangle, CalendarClock, FileClock, Info, Layers, MapPinned, PieChart, TrendingDown, Wallet } from 'lucide-react';
import type { Alerta, Severidad, TipoAlerta } from '@mli/core';
import type { PropsPagina } from '../App.tsx';
import { useConsulta } from '../lib/datos.ts';
import { EstadoCarga, Segmentado, Tarjeta } from '../components/ui.tsx';

export const SEVERIDAD: Record<Severidad, { texto: string; color: string; icono: typeof Info }> = {
  alta: { texto: 'Alta', color: 'var(--critical)', icono: AlertOctagon },
  media: { texto: 'Media', color: 'var(--serious)', icono: AlertTriangle },
  baja: { texto: 'Baja', color: 'var(--warning)', icono: Info },
};

export const TIPO: Record<TipoAlerta, { texto: string; icono: typeof Info; descripcion: string }> = {
  contrato_por_vencer: { texto: 'Contratos por vencer', icono: FileClock, descripcion: 'Contratos vigentes que terminan pronto: negociar la renovación o preparar la recolocación.' },
  pago_vencido: { texto: 'Pagos vencidos', icono: Wallet, descripcion: 'Inquilinos (actuales o antiguos) con recibos vencidos y saldo pendiente.' },
  reserva_por_vencer: { texto: 'Reservas por vencer', icono: CalendarClock, descripcion: 'Reservas activas a punto de caducar sin firma.' },
  local_vacio_prolongado: { texto: 'Locales vacíos mucho tiempo', icono: TrendingDown, descripcion: 'Locales disponibles desde hace más de seis meses.' },
  zona_baja_ocupacion: { texto: 'Zonas con baja ocupación', icono: MapPinned, descripcion: 'Zonas claramente por debajo de la ocupación media del centro.' },
  concentracion_categoria: { texto: 'Concentración de actividad', icono: PieChart, descripcion: 'Una actividad acapara demasiada superficie alquilada.' },
};

export function FilaAlerta({ a, compacta = false, abrirLocal }: { a: Alerta; compacta?: boolean; abrirLocal: (c: string) => void }) {
  const s = SEVERIDAD[a.severidad];
  const T = TIPO[a.tipo];
  const clic = a.entidad.tipo === 'local' ? () => abrirLocal(a.entidad.codigo) : undefined;
  return (
    <li>
      <div
        role={clic ? 'button' : undefined}
        tabIndex={clic ? 0 : undefined}
        onClick={clic}
        onKeyDown={(e) => clic && (e.key === 'Enter' || e.key === ' ') && clic()}
        className={`flex gap-3 rounded-lg px-3 py-2.5 ${clic ? 'cursor-pointer hover:bg-surface-2' : ''}`}
      >
        <s.icono size={17} className="mt-0.5 shrink-0" style={{ color: s.color }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-ink">{a.titulo}</span>
            <span className="text-[11px] font-medium" style={{ color: s.color }}>
              {s.texto}
            </span>
          </div>
          <div className="truncate text-xs text-ink-2">{a.detalle}</div>
          {!compacta && (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted">
              <T.icono size={12} /> Regla: {a.regla}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function Alertas({ params, abrirLocal }: PropsPagina) {
  const a = useConsulta<Alerta[]>('alertas', params);
  const [sev, setSev] = useState<Severidad | 'todas'>('todas');
  if (!a.datos) return <EstadoCarga error={a.error} />;
  const lista = a.datos.filter((x) => sev === 'todas' || x.severidad === sev);
  const grupos = (Object.keys(TIPO) as TipoAlerta[]).map((t) => ({ t, xs: lista.filter((x) => x.tipo === t) }));
  const cuenta = (s: Severidad) => a.datos!.filter((x) => x.severidad === s).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">Alertas</h1>
          <p className="mt-1 text-sm text-ink-2">Reglas explícitas y verificables; cada alerta indica la regla que la activa.</p>
        </div>
        <Segmentado
          etiqueta="Severidad"
          valor={sev}
          onChange={setSev}
          opciones={[
            { valor: 'todas', texto: `Todas · ${a.datos.length}` },
            { valor: 'alta', texto: `Alta · ${cuenta('alta')}` },
            { valor: 'media', texto: `Media · ${cuenta('media')}` },
            { valor: 'baja', texto: `Baja · ${cuenta('baja')}` },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {grupos.map(({ t }) => {
          const T = TIPO[t];
          const n = a.datos!.filter((x) => x.tipo === t).length;
          return (
            <div key={t} className="rounded-xl border border-line bg-surface p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-ink-2">
                <T.icono size={14} /> {T.texto}
              </div>
              <div className="mt-1.5 text-2xl font-semibold tabular text-ink">{n}</div>
            </div>
          );
        })}
      </div>

      {grupos
        .filter((g) => g.xs.length)
        .map(({ t, xs }) => (
          <Tarjeta key={t} titulo={TIPO[t].texto} subtitulo={TIPO[t].descripcion} cuerpo="p-2">
            <ul className="divide-y divide-[var(--border)]">
              {xs.map((x) => (
                <FilaAlerta key={x.id} a={x} abrirLocal={abrirLocal} />
              ))}
            </ul>
          </Tarjeta>
        ))}
      {!lista.length && (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface p-6 text-sm text-ink-2">
          <Layers size={16} /> No hay alertas con este filtro.
        </div>
      )}
    </div>
  );
}
