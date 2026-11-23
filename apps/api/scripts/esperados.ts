/**
 * Genera fabric/validacion/esperados.json: los KPI de referencia calculados por la capa
 * semántica (packages/core) que la capa Gold en SQL debe reproducir exactamente.
 * El pipeline los carga en control.kpi_esperado y los compara con gold.v_kpi_calculado.
 * Uso: npm run esperados
 *
 * Nota: fabric/warehouse/90_esperados.sql corresponde al modelo v1 (preventa) y ya no se regenera.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { analisisComercial, analisisFinanciero, crearContexto, generarDataset, resumen } from '@mli/core';

const ds = generarDataset();
const ctx = crearContexto(ds);
const r = resumen(ctx);
const c = analisisComercial(ctx);

type Fila = { ambito: string; clave: string; kpi: string; valor: number };
const kpis: Fila[] = [];
const g = (kpi: string, valor: number | null) => kpis.push({ ambito: 'global', clave: '', kpi, valor: valor ?? 0 });

g('locales_total', r.unidades.total);
g('locales_comercializables', r.unidades.comercializables);
g('locales_ocupados', r.unidades.ocupados);
g('locales_reservados', r.unidades.reservados);
g('locales_disponibles', r.unidades.disponibles);
g('m2_comercializables', r.superficie.comercializable);
g('m2_ocupados', r.superficie.ocupada);
g('pct_ocupacion', r.pctOcupacion);
g('renta_mensual', r.renta.mensual);
g('contratos_vigentes', r.contratos.vigentes);
g('contratos_por_vencer_90', r.contratos.porVencer90);
g('facturado_total', r.financiero.facturadoTotal);
g('facturado_12m', r.financiero.facturado12m);
g('cobrado_total', r.financiero.cobradoTotal);
g('vencido', r.financiero.vencido);
g('tasa_morosidad', r.financiero.tasaMorosidad);

for (const p of c.porPlanta) {
  kpis.push({ ambito: 'planta', clave: p.codigo, kpi: 'locales_ocupados', valor: p.ocupados });
  kpis.push({ ambito: 'planta', clave: p.codigo, kpi: 'm2_ocupados', valor: p.areaOcupada });
  kpis.push({ ambito: 'planta', clave: p.codigo, kpi: 'renta_mensual', valor: p.rentaMensual });
  kpis.push({ ambito: 'planta', clave: p.codigo, kpi: 'vencido', valor: p.vencido });
}
for (const z of c.porZona) {
  kpis.push({ ambito: 'zona', clave: z.codigo, kpi: 'locales_ocupados', valor: z.ocupados });
  kpis.push({ ambito: 'zona', clave: z.codigo, kpi: 'm2_ocupados', valor: z.areaOcupada });
  kpis.push({ ambito: 'zona', clave: z.codigo, kpi: 'renta_mensual', valor: z.rentaMensual });
}
for (const e of c.evolucion) {
  kpis.push({ ambito: 'mes', clave: e.mes, kpi: 'pct_ocupacion', valor: e.pctOcupacion ?? 0 });
  kpis.push({ ambito: 'mes', clave: e.mes, kpi: 'renta_mensual', valor: e.rentaMensual });
}

const f = analisisFinanciero(ctx);
const salida = {
  descripcion: 'KPI de referencia de la capa semántica (packages/core) sobre el conjunto FICTICIO. Gold en SQL debe coincidir.',
  version_modelo: '2',
  semilla: ds.meta.semilla,
  fecha_corte: ds.meta.fechaCorte,
  tolerancia: { importes_y_recuentos: 0, m2: 0.005, porcentajes: 1e-9 },
  resumen_legible: {
    pct_ocupacion: r.pctOcupacion,
    renta_mensual: r.renta.mensual,
    vencido: r.financiero.vencido,
    meses_facturados: f.mensual.filter((m) => !m.esFuturo && m.facturado > 0).length,
  },
  kpis,
};

const dir = fileURLToPath(new URL('../../../fabric/validacion/', import.meta.url));
await mkdir(dir, { recursive: true });
await writeFile(`${dir}esperados.json`, JSON.stringify(salida, null, 2) + '\n', 'utf8');
console.log(`esperados.json (modelo v2): ${kpis.length} valores · ocupación ${(r.pctOcupacion! * 100).toFixed(1)} % · renta ${r.renta.mensual}`);
