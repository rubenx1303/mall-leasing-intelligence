import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { EstadoComercial, LocalVista } from '@mli/core';
import type { PropsPagina } from '../App.tsx';
import { useConsulta } from '../lib/datos.ts';
import { CONTRATO_INFO, ESTADO_INFO, GRUPO_COLOR, ORDEN_ESTADOS } from '../lib/estados.ts';
import { cop, m2, pct } from '../lib/formato.ts';
import { Plano, type ModoColor } from '../components/Plano.tsx';
import { EstadoCarga, Leyenda, Segmentado, Tarjeta } from '../components/ui.tsx';

export function PlanoComercial({ params, cat, abrirLocal }: PropsPagina) {
  // El plano carga todos los locales de la fecha de corte; los filtros atenúan en lugar de ocultar.
  const loc = useConsulta<LocalVista[]>('locales', { corte: params.corte });
  const [plantaId, setPlantaId] = useState<number>(params.planta ?? 1);
  const [modo, setModo] = useState<ModoColor>('estado');
  const [estados, setEstados] = useState<Set<EstadoComercial>>(new Set(ORDEN_ESTADOS));
  const [busqueda, setBusqueda] = useState('');

  const planta = cat.plantas.find((p) => p.id === (params.planta ?? plantaId))!;
  const deLaPlanta = useMemo(() => (loc.datos ?? []).filter((l) => l.plantaId === planta.id), [loc.datos, planta.id]);

  const q = busqueda.trim().toUpperCase();
  const coincide = (l: LocalVista) =>
    estados.has(l.estado) &&
    (!params.zona || l.zonaId === params.zona) &&
    (!params.tipo || l.tipo === params.tipo) &&
    (!params.contrato || l.estadoContrato === params.contrato) &&
    (!q || l.codigo.includes(q) || (l.inquilino ?? '').toUpperCase().includes(q));

  if (!loc.datos) return <EstadoCarga error={loc.error} />;

  const visibles = deLaPlanta.filter(coincide);
  const cuenta = (e: EstadoComercial) => deLaPlanta.filter((l) => l.estado === e);
  const comerc = deLaPlanta.filter((l) => l.estado !== 'no_comercializable');
  const area = (xs: LocalVista[]) => xs.reduce((s, l) => s + l.areaM2, 0);
  const ocupados = cuenta('ocupado');
  const renta = ocupados.reduce((s, l) => s + (l.contrato?.canonMensual ?? 0), 0);
  const zonas = cat.zonas.filter((z) => z.plantaId === planta.id);

  const alternar = (e: EstadoComercial) => {
    const s = new Set(estados);
    if (s.has(e)) s.delete(e);
    else s.add(e);
    setEstados(s.size ? s : new Set(ORDEN_ESTADOS));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">Explorador de locales</h1>
          <p className="mt-1 text-sm text-ink-2">Plano genérico del centro ficticio. Pulsa un local para ver su ficha: contrato, renta, cobros e historia.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!params.planta && (
            <Segmentado etiqueta="Planta" valor={plantaId} onChange={setPlantaId} opciones={cat.plantas.map((p) => ({ valor: p.id, texto: p.nombre }))} />
          )}
          <Segmentado
            etiqueta="Color"
            valor={modo}
            onChange={setModo}
            opciones={[
              { valor: 'estado', texto: 'Ocupación' },
              { valor: 'contrato', texto: 'Contrato' },
              { valor: 'actividad', texto: 'Actividad' },
            ]}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <Tarjeta cuerpo="p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {modo === 'estado' &&
              ORDEN_ESTADOS.map((e) => (
                <button
                  key={e}
                  onClick={() => alternar(e)}
                  aria-pressed={estados.has(e)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                    estados.has(e) ? 'border-line bg-surface-2 text-ink' : 'border-dashed border-line text-muted line-through'
                  }`}
                >
                  <span className="inline-block size-2.5 rounded-[3px]" style={{ background: ESTADO_INFO[e].color }} />
                  {ESTADO_INFO[e].etiqueta}
                  <span className="tabular text-muted">{cuenta(e).length}</span>
                </button>
              ))}
            {modo === 'contrato' && (
              <Leyenda
                items={(['vigente', 'por_vencer', 'sin_contrato'] as const).map((k) => ({
                  etiqueta: CONTRATO_INFO[k].etiqueta,
                  color: CONTRATO_INFO[k].color,
                  valor: String(deLaPlanta.filter((l) => l.estadoContrato === k).length),
                }))}
              />
            )}
            {modo === 'actividad' && (
              <Leyenda
                items={[
                  ...Object.entries(GRUPO_COLOR).map(([g, c]) => ({ etiqueta: g === 'Ancla' ? 'Ancla comercial' : g, color: c })),
                  { etiqueta: 'No comercializable', color: ESTADO_INFO.no_comercializable.color },
                ]}
              />
            )}
            <label className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-sm focus-within:border-accent">
              <Search size={14} className="text-muted" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar local o inquilino"
                className="w-44 bg-transparent text-ink outline-none placeholder:text-muted"
                aria-label="Buscar local o inquilino"
              />
            </label>
          </div>
          <Plano
            planta={planta}
            locales={deLaPlanta}
            elementos={cat.elementos}
            categorias={cat.categorias}
            modoColor={modo}
            coincide={coincide}
            resaltado={q && visibles.length === 1 ? visibles[0].codigo : null}
            onSelect={abrirLocal}
          />
        </Tarjeta>

        <div className="space-y-4">
          <Tarjeta titulo={planta.nombre} subtitulo={`${deLaPlanta.length} locales · ${m2(area(deLaPlanta))}`}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-2">Ocupación (m²)</dt>
                <dd className="text-lg font-semibold tabular text-ink">{pct(area(ocupados) / (area(comerc) || 1))}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-2">Locales ocupados</dt>
                <dd className="text-lg font-semibold tabular text-ink">
                  {ocupados.length} / {comerc.length}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-2">Renta mensual</dt>
                <dd className="font-semibold tabular text-ink">{cop(renta)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-2">Disponible</dt>
                <dd className="font-semibold tabular text-ink">{m2(area(cuenta('disponible')))}</dd>
              </div>
            </dl>
          </Tarjeta>
          <Tarjeta titulo="Zonas" cuerpo="px-4 pb-4 pt-2 sm:px-5">
            <ul className="space-y-3">
              {zonas.map((z) => {
                const ls = deLaPlanta.filter((l) => l.zonaId === z.id && l.estado !== 'no_comercializable');
                const o = area(ls.filter((l) => l.estado === 'ocupado'));
                const r = area(ls.filter((l) => l.estado === 'reservado'));
                const t = area(ls) || 1;
                return (
                  <li key={z.id}>
                    <div className="flex justify-between text-xs">
                      <span className="text-ink">{z.nombre}</span>
                      <span className="tabular text-ink-2">{pct(o / t, 0)}</span>
                    </div>
                    <div className="mt-1 flex h-2 gap-[2px] overflow-hidden rounded-full bg-surface-2">
                      <div style={{ width: `${(o / t) * 100}%`, background: ESTADO_INFO.ocupado.color }} />
                      <div style={{ width: `${(r / t) * 100}%`, background: ESTADO_INFO.reservado.color }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Tarjeta>
          <p className="px-1 text-[11px] leading-relaxed text-muted">
            Los filtros de zona, tipo de local y estado del contrato atenúan los locales que no coinciden. El plano es una representación genérica de un
            centro inventado.
          </p>
        </div>
      </div>
    </div>
  );
}
