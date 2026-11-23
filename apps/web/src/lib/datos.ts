import { useEffect, useState } from 'react';
import {
  alertas,
  analisisComercial,
  analisisFinanciero,
  catalogos,
  crearContexto,
  detalleLocal,
  localesVista,
  resumen,
  type Dataset,
  type EstadoContractual,
  type Filtro,
  type TipoLocal,
} from '@mli/core';

/**
 * Fuente de datos de la interfaz. En los dos modos los datos proceden de la capa GOLD:
 *  - «api»: API REST que lee el esquema gold de PostgreSQL (modo normal).
 *  - «local»: si la API no responde, se carga la instantánea de Gold (public/demo/gold.json,
 *    generada por el pipeline) y la capa semántica calcula los indicadores en el navegador.
 */
export type Modo = 'api' | 'local';

export interface Params {
  corte?: string;
  planta?: number;
  zona?: number;
  categoria?: number;
  tipo?: TipoLocal;
  contrato?: EstadoContractual;
}

export interface Origen {
  modo: Modo;
  fuente: string;
  ejecutadoEn?: string;
  kpisOk?: number;
  kpisFallo?: number;
}

let modoPromesa: Promise<Origen> | null = null;
let dsLocal: Dataset | null = null;

async function cargarInstantanea(): Promise<{ origen: Record<string, unknown> | null; dataset: Dataset }> {
  const r = await fetch(`${import.meta.env.BASE_URL}demo/gold.json`);
  if (!r.ok) throw new Error('No hay instantánea de Gold: ejecuta «npm.cmd run demo:restaurar»');
  return r.json();
}

/** Solo para pruebas: inyecta el conjunto del modo local. */
export function fijarDatasetLocal(ds: Dataset) {
  dsLocal = ds;
  modoPromesa = Promise.resolve({ modo: 'local', fuente: 'prueba' });
}

export function detectarOrigen(): Promise<Origen> {
  if (!modoPromesa) {
    modoPromesa = (async (): Promise<Origen> => {
      if (import.meta.env.VITE_FUENTE !== 'local') {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 2500);
          const r = await fetch('/api/salud', { signal: ctrl.signal });
          clearTimeout(t);
          if (r.ok) {
            const s = await r.json();
            return {
              modo: 'api',
              fuente: s.fuente,
              ejecutadoEn: s.origen?.ejecutado_en,
              kpisOk: s.origen?.kpis_ok,
              kpisFallo: s.origen?.kpis_fallo,
            };
          }
        } catch {
          /* sin API: modo local */
        }
      }
      const inst = await cargarInstantanea();
      dsLocal = inst.dataset;
      const o = inst.origen as { ejecutado_en?: string; kpis_ok?: number; kpis_fallo?: number } | null;
      return { modo: 'local', fuente: 'instantánea de Gold', ejecutadoEn: o?.ejecutado_en, kpisOk: o?.kpis_ok, kpisFallo: o?.kpis_fallo };
    })();
  }
  return modoPromesa;
}

function qs(p: Params): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}

function local(ruta: string, p: Params): unknown {
  const ds = dsLocal!;
  const filtro: Filtro = {};
  if (p.planta) filtro.plantaId = p.planta;
  if (p.zona) filtro.zonaId = p.zona;
  if (p.categoria) filtro.categoriaId = p.categoria;
  if (p.tipo) filtro.tipoLocal = p.tipo;
  if (p.contrato) filtro.estadoContrato = p.contrato;
  const ctx = crearContexto(ds, { corte: p.corte, filtro });
  if (ruta === 'catalogos') return catalogos(ds);
  if (ruta === 'resumen') return resumen(ctx);
  if (ruta === 'locales') return localesVista(ctx);
  if (ruta === 'comercial') return analisisComercial(ctx);
  if (ruta === 'financiero') return analisisFinanciero(ctx);
  if (ruta === 'alertas') return alertas(ctx);
  if (ruta.startsWith('locales/')) return detalleLocal(crearContexto(ds, { corte: p.corte }), decodeURIComponent(ruta.slice(8)));
  throw new Error(`Ruta desconocida: ${ruta}`);
}

export async function consultar<T>(ruta: string, p: Params = {}, signal?: AbortSignal): Promise<T> {
  const o = await detectarOrigen();
  if (o.modo === 'local') return local(ruta, p) as T;
  const r = await fetch(`/api/${ruta}${qs(p)}`, { signal });
  if (!r.ok) throw new Error(`La API respondió ${r.status}`);
  return (await r.json()) as T;
}

export interface Estado<T> {
  datos: T | null;
  cargando: boolean;
  error: string | null;
}

/** Carga datos y conserva los anteriores mientras llegan los nuevos (sin parpadeos). */
export function useConsulta<T>(ruta: string | null, p: Params = {}): Estado<T> {
  const [estado, setEstado] = useState<Estado<T>>({ datos: null, cargando: !!ruta, error: null });
  const clave = ruta ? `${ruta}${qs(p)}` : null;
  useEffect(() => {
    if (!ruta) return;
    const ctrl = new AbortController();
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    consultar<T>(ruta, p, ctrl.signal)
      .then((datos) => setEstado({ datos, cargando: false, error: null }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setEstado((s) => ({ ...s, cargando: false, error: e instanceof Error ? e.message : String(e) }));
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return estado;
}
