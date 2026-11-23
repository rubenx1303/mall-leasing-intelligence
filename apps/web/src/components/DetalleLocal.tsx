import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { DetalleLocal } from '@mli/core';
import { useConsulta } from '../lib/datos.ts';
import { CONTRATO_INFO, ESTADO_INFO, TIPO_LOCAL } from '../lib/estados.ts';
import { cop, fecha, m2, mesLargo, num } from '../lib/formato.ts';
import { Insignia } from './ui.tsx';

const TIPO_ACT: Record<string, string> = {
  lead: 'Nuevo interesado',
  visita: 'Visita',
  propuesta: 'Propuesta enviada',
  reserva: 'Reserva',
  contrato: 'Firma de contrato',
  renovacion: 'Renovación',
  desistimiento: 'Desistimiento',
};

export function DetalleLocalPanel({ codigo, corte, onClose }: { codigo: string; corte?: string; onClose: () => void }) {
  const d = useConsulta<DetalleLocal>(`locales/${encodeURIComponent(codigo)}`, { corte });

  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, [onClose]);

  const l = d.datos?.local;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={`Ficha del local ${codigo}`}>
      <button className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} aria-label="Cerrar ficha" />
      <aside className="aparecer relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-surface shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface px-5 py-4">
          <div>
            <div className="text-xs text-muted">Ficha del local</div>
            <h2 className="text-lg font-semibold text-ink">{codigo}</h2>
            {l && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Insignia color={ESTADO_INFO[l.estado].color}>{ESTADO_INFO[l.estado].etiqueta}</Insignia>
                {l.estado === 'ocupado' && <Insignia color={CONTRATO_INFO[l.estadoContrato].color}>{CONTRATO_INFO[l.estadoContrato].etiqueta}</Insignia>}
                <Insignia>{l.planta}</Insignia>
                <Insignia>{l.zona}</Insignia>
              </div>
            )}
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-2" aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        {!d.datos ? (
          <div className="p-5 text-sm text-ink-2">{d.error ?? 'Cargando…'}</div>
        ) : (
          <div className="space-y-6 px-5 py-5 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Dato t="Superficie" v={m2(l!.areaM2)} />
              <Dato t="Tipo" v={TIPO_LOCAL[l!.tipo]} />
              <Dato t="Uso previsto" v={l!.descripcion ?? l!.categoria ?? '—'} />
              {l!.rentaLista > 0 && <Dato t="Renta de lista" v={`${cop(l!.rentaLista)}/mes`} />}
              <Dato t="Facturado (12 meses)" v={cop(l!.facturado12m)} />
              <Dato t="Cobrado (12 meses)" v={cop(l!.cobrado12m)} />
              {l!.vencido > 0 && <Dato t="Deuda vencida" v={<span className="text-[var(--critical)]">{cop(l!.vencido)}</span>} />}
              {l!.diasVacio !== null && <Dato t="Vacío desde hace" v={`${num(l!.diasVacio)} días`} />}
              <Dato t="Interesados (12 meses)" v={num(l!.interesados12m)} />
            </dl>

            {l!.contrato && (
              <Bloque titulo="Contrato vigente">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Dato t="Inquilino (marca ficticia)" v={l!.inquilino ?? '—'} />
                  <Dato t="Actividad" v={l!.contrato.actividad} />
                  <Dato t="Renta mensual" v={cop(l!.contrato.canonMensual)} />
                  <Dato t="Renta por m²" v={cop(l!.contrato.canonM2)} />
                  <Dato t="Inicio" v={fecha(l!.contrato.fechaInicio)} />
                  <Dato t="Fin" v={`${fecha(l!.contrato.fechaFin)} (${l!.contrato.diasRestantes} días)`} />
                  <Dato t="Plazo" v={`${l!.contrato.plazoMeses} meses${l!.contrato.esRenovacion ? ' · renovación' : ''}`} />
                  <Dato t="Código" v={l!.contrato.codigo} />
                </dl>
              </Bloque>
            )}

            {l!.reserva && (
              <Bloque titulo="Reserva activa">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Dato t="Interesado" v={l!.inquilino ?? '—'} />
                  <Dato t="Separación" v={cop(l!.reserva.importeSeparacion)} />
                  <Dato t="Reservado el" v={fecha(l!.reserva.fechaReserva)} />
                  <Dato t="Vence el" v={`${fecha(l!.reserva.fechaVencimiento)} (${l!.reserva.diasRestantes} días)`} />
                </dl>
                <p className="mt-2 text-xs text-muted">Una reserva no es un contrato: el local no cuenta como ocupado ni genera renta.</p>
              </Bloque>
            )}

            {d.datos.recibos.length > 0 && (
              <Bloque titulo="Recibos (últimos 12 meses y próximos)">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted">
                      <tr>
                        <th className="py-1 font-medium">Mes</th>
                        <th className="py-1 text-right font-medium">Importe</th>
                        <th className="py-1 text-right font-medium">Pagado</th>
                        <th className="py-1 text-right font-medium">Situación</th>
                      </tr>
                    </thead>
                    <tbody className="tabular">
                      {d.datos.recibos.map((q, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="py-1.5 text-ink-2">{mesLargo(q.mes)}</td>
                          <td className="py-1.5 text-right text-ink">{cop(q.importe)}</td>
                          <td className="py-1.5 text-right text-ink-2">{q.pagado ? cop(q.pagado) : '—'}</td>
                          <td className={`py-1.5 text-right ${q.situacion.startsWith('Vencido') ? 'font-medium text-[var(--critical)]' : 'text-ink-2'}`}>{q.situacion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Bloque>
            )}

            {d.datos.contratos.length > 0 && (
              <Bloque titulo="Historial de contratos">
                <ul className="space-y-2">
                  {d.datos.contratos.map((c) => (
                    <li key={c.codigo} className="flex justify-between gap-3 text-xs">
                      <span className="text-ink">
                        {c.codigo} · {c.inquilino}
                        {c.esRenovacion && <span className="text-muted"> (renovación)</span>}
                        <span className="block text-muted">
                          {fecha(c.fechaInicio)} → {fecha(c.fechaTerminacion ?? c.fechaFin)} · {cop(c.canonMensual)}/mes
                        </span>
                      </span>
                      <span className="shrink-0 text-ink-2">{c.situacion}</span>
                    </li>
                  ))}
                </ul>
              </Bloque>
            )}

            {d.datos.reservas.length > 0 && (
              <Bloque titulo="Reservas">
                <ul className="space-y-2">
                  {d.datos.reservas.map((r) => (
                    <li key={r.codigo} className="flex justify-between gap-3 text-xs">
                      <span className="text-ink">
                        {r.codigo} · {r.interesado}
                        <span className="block text-muted">
                          {fecha(r.fechaReserva)} → {fecha(r.fechaVencimiento)}
                        </span>
                      </span>
                      <span className="shrink-0 text-ink-2">{r.resultado}</span>
                    </li>
                  ))}
                </ul>
              </Bloque>
            )}

            <Bloque titulo="Actividad comercial">
              {d.datos.historial.length ? (
                <ol className="relative space-y-3 border-l border-line pl-4">
                  {d.datos.historial.slice(0, 20).map((h, i) => (
                    <li key={i} className="text-xs">
                      <span className="absolute -left-[4.5px] mt-1 size-2 rounded-full bg-[var(--axis)]" />
                      <div className="text-ink">{TIPO_ACT[h.tipo] ?? h.tipo}</div>
                      <div className="text-muted">
                        {fecha(h.fecha)} · {h.cliente}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-muted">Sin actividad registrada.</p>
              )}
            </Bloque>
          </div>
        )}
      </aside>
    </div>
  );
}

function Dato({ t, v }: { t: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{t}</dt>
      <dd className="mt-0.5 font-medium text-ink">{v}</dd>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-2">{titulo}</h3>
      {children}
    </section>
  );
}
