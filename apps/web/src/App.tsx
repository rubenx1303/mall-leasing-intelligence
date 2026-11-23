import { useEffect, useMemo, useState } from 'react';
import { Bell, Building2, ChartNoAxesCombined, LayoutDashboard, Map, Moon, RotateCcw, Sun, Table2, Wallet } from 'lucide-react';
import type { Catalogos, EstadoContractual, TipoLocal } from '@mli/core';
import { detectarOrigen, useConsulta, type Origen, type Params } from './lib/datos.ts';
import { fecha } from './lib/formato.ts';
import { CONTRATO_INFO, TIPO_LOCAL } from './lib/estados.ts';
import { Selector } from './components/ui.tsx';
import { DetalleLocalPanel } from './components/DetalleLocal.tsx';
import { Resumen } from './pages/Resumen.tsx';
import { PlanoComercial } from './pages/PlanoComercial.tsx';
import { Comercial } from './pages/Comercial.tsx';
import { Financiero } from './pages/Financiero.tsx';
import { Alertas } from './pages/Alertas.tsx';
import { Locales } from './pages/Locales.tsx';

export type Pagina = 'resumen' | 'plano' | 'comercial' | 'financiero' | 'alertas' | 'locales';

const PAGINAS: { id: Pagina; texto: string; icono: typeof Map }[] = [
  { id: 'resumen', texto: 'Resumen ejecutivo', icono: LayoutDashboard },
  { id: 'plano', texto: 'Explorador de locales', icono: Map },
  { id: 'comercial', texto: 'Ocupación y contratos', icono: ChartNoAxesCombined },
  { id: 'financiero', texto: 'Ingresos y cobros', icono: Wallet },
  { id: 'alertas', texto: 'Alertas', icono: Bell },
  { id: 'locales', texto: 'Inventario de locales', icono: Table2 },
];

export interface PropsPagina {
  params: Params;
  cat: Catalogos;
  abrirLocal: (codigo: string) => void;
  irA: (p: Pagina) => void;
}

function paginaDesdeHash(): Pagina {
  const h = location.hash.replace('#/', '') as Pagina;
  return PAGINAS.some((p) => p.id === h) ? h : 'resumen';
}

export function App() {
  const [pagina, setPagina] = useState<Pagina>(paginaDesdeHash);
  const [origen, setOrigen] = useState<Origen | null>(null);
  const [oscuro, setOscuro] = useState(() => document.documentElement.classList.contains('dark'));
  const [corte, setCorte] = useState<string>('');
  const [planta, setPlanta] = useState<number | ''>('');
  const [zona, setZona] = useState<number | ''>('');
  const [tipo, setTipo] = useState<TipoLocal | ''>('');
  const [contrato, setContrato] = useState<EstadoContractual | ''>('');
  const [localAbierto, setLocalAbierto] = useState<string | null>(null);

  const cat = useConsulta<Catalogos>('catalogos');

  useEffect(() => {
    detectarOrigen().then(setOrigen);
    const f = () => setPagina(paginaDesdeHash());
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', oscuro);
    try {
      localStorage.setItem('mli-tema', oscuro ? 'oscuro' : 'claro');
    } catch {
      /* almacenamiento no disponible */
    }
  }, [oscuro]);

  const irA = (p: Pagina) => {
    location.hash = `/${p}`;
    setPagina(p);
    window.scrollTo({ top: 0 });
  };

  const params: Params = useMemo(
    () => ({
      corte: corte || undefined,
      planta: planta || undefined,
      zona: zona || undefined,
      tipo: tipo || undefined,
      contrato: contrato || undefined,
    }),
    [corte, planta, zona, tipo, contrato],
  );

  const c = cat.datos;
  const hayFiltros = corte || planta || zona || tipo || contrato;
  const zonas = c ? c.zonas.filter((z) => !planta || z.plantaId === planta) : [];
  const props: PropsPagina | null = c ? { params, cat: c, abrirLocal: setLocalAbierto, irA } : null;

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <Marca centro={c?.meta.centro} />
        <nav className="flex-1 space-y-0.5 px-3 py-2" aria-label="Secciones">
          {PAGINAS.map((p) => (
            <button
              key={p.id}
              onClick={() => irA(p.id)}
              aria-current={pagina === p.id ? 'page' : undefined}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                pagina === p.id ? 'bg-surface-2 font-semibold text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              }`}
            >
              <p.icono size={17} strokeWidth={pagina === p.id ? 2.25 : 1.75} />
              {p.texto}
            </button>
          ))}
        </nav>
        <div className="space-y-2 border-t border-line p-4 text-[11px] leading-relaxed text-muted">
          <FuenteDatos origen={origen} />
          <p>Centro comercial y datos ficticios, creados para demostración. Funciona en local, sin servicios de pago.</p>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="z-20 border-b border-line bg-plane/90 backdrop-blur lg:sticky lg:top-0">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 lg:hidden">
            <Marca compacta centro={c?.meta.centro} />
            <BotonTema oscuro={oscuro} onClick={() => setOscuro(!oscuro)} />
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden" aria-label="Secciones">
            {PAGINAS.map((p) => (
              <button
                key={p.id}
                onClick={() => irA(p.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                  pagina === p.id ? 'bg-ink text-plane' : 'border border-line bg-surface text-ink-2'
                }`}
              >
                {p.texto}
              </button>
            ))}
          </nav>
          {c && (
            <div className="flex flex-wrap items-end gap-3 px-4 pb-3 pt-1 sm:px-6 lg:pt-3">
              <Selector
                etiqueta="Fecha de corte"
                valor={corte}
                ancho="w-36"
                opciones={[
                  { valor: '', texto: `Hoy · ${fecha(c.meta.fechaCorte)}` },
                  ...c.cortes
                    .slice(0, -1)
                    .reverse()
                    .map((d) => ({ valor: d, texto: fecha(d) })),
                ]}
                onChange={setCorte}
              />
              <Selector
                etiqueta="Planta"
                valor={planta}
                ancho="w-28"
                opciones={[{ valor: '', texto: 'Todas' }, ...c.plantas.map((p) => ({ valor: p.id, texto: p.nombre }))]}
                onChange={(v) => {
                  setPlanta(v);
                  setZona('');
                }}
              />
              <Selector
                etiqueta="Zona"
                valor={zona}
                ancho="w-48"
                opciones={[{ valor: '', texto: 'Todas' }, ...zonas.map((z) => ({ valor: z.id, texto: planta ? z.nombre : `${z.nombre} · P${z.plantaId}` }))]}
                onChange={setZona}
              />
              <Selector
                etiqueta="Tipo de local"
                valor={tipo}
                ancho="w-36"
                opciones={[{ valor: '', texto: 'Todos' }, ...(['ancla', 'local', 'isla', 'tecnico'] as const).map((t) => ({ valor: t, texto: TIPO_LOCAL[t] }))]}
                onChange={setTipo}
              />
              <Selector
                etiqueta="Estado del contrato"
                valor={contrato}
                ancho="w-44"
                opciones={[
                  { valor: '', texto: 'Todos' },
                  ...(['vigente', 'por_vencer', 'sin_contrato'] as const).map((t) => ({ valor: t, texto: CONTRATO_INFO[t].etiqueta })),
                ]}
                onChange={setContrato}
              />
              {hayFiltros && (
                <button
                  onClick={() => {
                    setCorte('');
                    setPlanta('');
                    setZona('');
                    setTipo('');
                    setContrato('');
                  }}
                  className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-accent-ink hover:bg-surface-2"
                >
                  <RotateCcw size={14} /> Restablecer
                </button>
              )}
              <div className="ml-auto hidden items-center gap-3 xl:flex">
                <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2">
                  Datos ficticios · corte <b className="font-semibold text-ink">{fecha(corte || c.meta.fechaCorte)}</b>
                </span>
                <BotonTema oscuro={oscuro} onClick={() => setOscuro(!oscuro)} />
              </div>
            </div>
          )}
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6">
          {!props ? (
            <div className="rounded-xl border border-line bg-surface p-6 text-sm text-ink-2">
              {cat.error ? `No se pudieron cargar los datos: ${cat.error}` : 'Cargando…'}
            </div>
          ) : (
            <>
              {pagina === 'resumen' && <Resumen {...props} />}
              {pagina === 'plano' && <PlanoComercial {...props} />}
              {pagina === 'comercial' && <Comercial {...props} />}
              {pagina === 'financiero' && <Financiero {...props} />}
              {pagina === 'alertas' && <Alertas {...props} />}
              {pagina === 'locales' && <Locales {...props} />}
            </>
          )}
          <footer className="mt-10 border-t border-line pt-4 text-[11px] text-muted lg:hidden">
            <FuenteDatos origen={origen} /> · Centro comercial y datos ficticios.
          </footer>
        </main>
      </div>

      {localAbierto && <DetalleLocalPanel codigo={localAbierto} corte={params.corte} onClose={() => setLocalAbierto(null)} />}
    </div>
  );
}

function Marca({ compacta = false, centro }: { compacta?: boolean; centro?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${compacta ? '' : 'px-5 pb-4 pt-5'}`}>
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#1f3b33] text-white">
        <Building2 size={19} />
      </div>
      <div className="min-w-0 leading-tight">
        <div className="text-sm font-semibold tracking-tight text-ink">Mall Intelligence</div>
        <div className="truncate text-[11px] text-muted">{centro ?? 'Demo de analítica comercial'}</div>
      </div>
    </div>
  );
}

function BotonTema({ oscuro, onClick }: { oscuro: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-ink-2 hover:text-ink"
      aria-label={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={oscuro ? 'Modo claro' : 'Modo oscuro'}
    >
      {oscuro ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function FuenteDatos({ origen }: { origen: Origen | null }) {
  if (!origen) return null;
  const validado = origen.kpisOk !== undefined && origen.kpisFallo === 0;
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5">
        <span className={`inline-block size-1.5 rounded-full ${origen.modo === 'api' ? 'bg-[var(--good)]' : 'bg-[var(--warning)]'}`} />
        {origen.modo === 'api' ? 'Modelo analítico Gold · API local' : 'Instantánea de Gold · sin servidor'}
      </span>
      {validado && (
        <span title="KPI calculados en SQL sobre Gold que coinciden con la capa semántica">
          {origen.kpisOk}/{origen.kpisOk} KPI validados{origen.ejecutadoEn ? ` · pipeline ${fecha(String(origen.ejecutadoEn).slice(0, 10))}` : ''}
        </span>
      )}
    </span>
  );
}
