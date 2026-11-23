import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Search } from 'lucide-react';
import type { EstadoComercial, LocalVista } from '@mli/core';
import type { PropsPagina } from '../App.tsx';
import { useConsulta } from '../lib/datos.ts';
import { CONTRATO_INFO, ESTADO_INFO, ORDEN_ESTADOS, TIPO_LOCAL } from '../lib/estados.ts';
import { cop, fecha, num } from '../lib/formato.ts';
import { EstadoCarga, Tarjeta } from '../components/ui.tsx';

type Col = 'codigo' | 'zona' | 'tipo' | 'areaM2' | 'estado' | 'inquilino' | 'renta' | 'fin' | 'facturado12m' | 'vencido' | 'diasVacio';

export function Locales({ params, abrirLocal }: PropsPagina) {
  const loc = useConsulta<LocalVista[]>('locales', params);
  const [estado, setEstado] = useState<EstadoComercial | ''>('');
  const [q, setQ] = useState('');
  const [orden, setOrden] = useState<{ col: Col; asc: boolean }>({ col: 'codigo', asc: true });

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    const xs = (loc.datos ?? []).filter(
      (l) => (!estado || l.estado === estado) && (!t || [l.codigo, l.zona, l.categoria ?? '', l.inquilino ?? ''].some((s) => s.toLowerCase().includes(t))),
    );
    const clave = (l: LocalVista): string | number => {
      switch (orden.col) {
        case 'renta':
          return l.contrato?.canonMensual ?? 0;
        case 'fin':
          return l.contrato?.diasRestantes ?? 99999;
        case 'estado':
          return ORDEN_ESTADOS.indexOf(l.estado);
        case 'diasVacio':
          return l.diasVacio ?? -1;
        default:
          return (l[orden.col] as string | number | null) ?? '';
      }
    };
    return [...xs].sort((a, b) => {
      const x = clave(a);
      const y = clave(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es');
      return orden.asc ? r : -r;
    });
  }, [loc.datos, estado, q, orden]);

  if (!loc.datos) return <EstadoCarga error={loc.error} />;

  const exportar = () => {
    const cab = ['codigo', 'planta', 'zona', 'tipo', 'uso_previsto', 'area_m2', 'estado', 'estado_contrato', 'inquilino_ficticio', 'renta_mensual', 'fin_contrato', 'facturado_12m', 'cobrado_12m', 'vencido', 'dias_vacio'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = filas.map((l) =>
      [l.codigo, l.planta, l.zona, l.tipo, l.categoria, l.areaM2, l.estado, l.estadoContrato, l.inquilino, l.contrato?.canonMensual ?? '', l.contrato?.fechaFin ?? '', l.facturado12m, l.cobrado12m, l.vencido, l.diasVacio ?? '']
        .map(esc)
        .join(';'),
    );
    const blob = new Blob(['﻿' + [cab.join(';'), ...lineas].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `locales-ficticios-${params.corte ?? 'corte-actual'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const Th = ({ col, children, derecha = false }: { col: Col; children: React.ReactNode; derecha?: boolean }) => (
    <th className={`px-3 py-2.5 font-medium ${derecha ? 'text-right' : ''}`} aria-sort={orden.col === col ? (orden.asc ? 'ascending' : 'descending') : 'none'}>
      <button className={`inline-flex items-center gap-1 hover:text-ink ${orden.col === col ? 'text-ink' : ''}`} onClick={() => setOrden({ col, asc: orden.col === col ? !orden.asc : true })}>
        {children}
        {orden.col === col && (orden.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">Inventario de locales</h1>
          <p className="mt-1 text-sm text-ink-2">Cada local con su estado, contrato, renta y cobros. Pulsa una fila para abrir la ficha.</p>
        </div>
        <button onClick={exportar} className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2">
          <Download size={15} /> Exportar CSV
        </button>
      </div>

      <Tarjeta cuerpo="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <label className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-sm focus-within:border-accent">
            <Search size={14} className="text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código, zona, uso o inquilino" className="w-52 bg-transparent text-ink outline-none placeholder:text-muted" aria-label="Buscar" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {(['', ...ORDEN_ESTADOS] as const).map((e) => (
              <button
                key={e || 'todos'}
                onClick={() => setEstado(e)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${estado === e ? 'border-transparent bg-ink text-plane' : 'border-line text-ink-2 hover:text-ink'}`}
              >
                {e && <span className="inline-block size-2 rounded-full" style={{ background: ESTADO_INFO[e].color }} />}
                {e ? ESTADO_INFO[e].etiqueta : 'Todos'}
                <span className="tabular opacity-70">{e ? loc.datos!.filter((l) => l.estado === e).length : loc.datos!.length}</span>
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-muted">{filas.length} locales</span>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="sticky top-0 z-[1] border-b border-line bg-surface text-left text-xs text-muted">
              <tr>
                <Th col="codigo">Local</Th>
                <Th col="zona">Zona</Th>
                <Th col="tipo">Tipo</Th>
                <Th col="areaM2" derecha>m²</Th>
                <Th col="estado">Estado</Th>
                <Th col="inquilino">Inquilino (ficticio)</Th>
                <Th col="renta" derecha>Renta mensual</Th>
                <Th col="fin">Fin contrato</Th>
                <Th col="facturado12m" derecha>Facturado 12 m</Th>
                <Th col="vencido" derecha>Vencido</Th>
                <Th col="diasVacio" derecha>Días vacío</Th>
              </tr>
            </thead>
            <tbody className="tabular">
              {filas.map((l) => (
                <tr key={l.codigo} onClick={() => abrirLocal(l.codigo)} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">{l.codigo}</td>
                  <td className="px-3 py-2 text-ink-2">
                    {l.zona} <span className="text-muted">· P{l.plantaId}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-2">{TIPO_LOCAL[l.tipo]}</td>
                  <td className="px-3 py-2 text-right text-ink">{num(l.areaM2)}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <span className="inline-block size-2 rounded-full" style={{ background: ESTADO_INFO[l.estado].color }} />
                      {ESTADO_INFO[l.estado].etiqueta}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-2">{l.inquilino ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-ink">{l.contrato ? cop(l.contrato.canonMensual) : '—'}</td>
                  <td className="px-3 py-2">
                    {l.contrato ? (
                      <span className={l.estadoContrato === 'por_vencer' ? 'font-medium text-[var(--s2)]' : 'text-ink-2'} title={CONTRATO_INFO[l.estadoContrato].etiqueta}>
                        {fecha(l.contrato.fechaFin)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-2">{l.facturado12m ? cop(l.facturado12m) : '—'}</td>
                  <td className={`px-3 py-2 text-right ${l.vencido > 0 ? 'font-medium text-[var(--critical)]' : 'text-muted'}`}>{l.vencido > 0 ? cop(l.vencido) : '—'}</td>
                  <td className="px-3 py-2 text-right text-ink-2">{l.diasVacio ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
