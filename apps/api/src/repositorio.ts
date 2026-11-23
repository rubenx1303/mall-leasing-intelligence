import type pg from 'pg';
import type { Dataset, MetaDataset } from '@mli/core';

type Fila = Record<string, unknown>;

function meta(params: { clave: string; valor: string }[]): MetaDataset {
  const p = Object.fromEntries(params.map((x) => [x.clave, x.valor]));
  if (!p.fecha_corte) throw new Error('No hay datos: ejecuta «npm.cmd run demo:restaurar»');
  return {
    nombre: p.nombre,
    centro: p.centro,
    version: p.version,
    ficticio: true,
    semilla: Number(p.semilla),
    moneda: 'COP',
    fechaCorte: p.fecha_corte,
    fechaApertura: p.fecha_apertura,
    aviso: p.aviso,
  };
}

const sinDescripcionNula = <T extends Fila>(xs: T[]) =>
  xs.map((x) => Object.fromEntries(Object.entries(x).filter(([k, v]) => !(k === 'descripcion' && v === null))) as T);

/**
 * Lee el MODELO ANALÍTICO (esquema «gold», generado por el pipeline Bronze → Silver → Gold)
 * y lo expone con la forma del núcleo para que la capa semántica calcule los indicadores.
 * Esta es la fuente del dashboard.
 */
export async function cargarDatasetGold(pool: pg.Pool): Promise<Dataset> {
  const q = async <T = Fila>(sql: string) => (await pool.query(sql)).rows as T[];
  const [params, plantas, zonas, categorias, locales, elementos, clientes, actividades, reservas, contratos, cuotas, pagos] = await Promise.all([
    q<{ clave: string; valor: string }>('SELECT clave, valor FROM gold.parametros'),
    q('SELECT planta_sk AS id, codigo, nombre, nivel, ancho, alto FROM gold.dim_planta ORDER BY planta_sk'),
    q('SELECT zona_sk AS id, planta_sk AS "plantaId", codigo, nombre, tipo FROM gold.dim_zona WHERE zona_sk > 0 ORDER BY zona_sk'),
    q('SELECT categoria_sk AS id, codigo, nombre, grupo FROM gold.dim_categoria WHERE categoria_sk > 0 ORDER BY categoria_sk'),
    q(`SELECT local_sk AS id, codigo, planta_sk AS "plantaId", zona_sk AS "zonaId",
              NULLIF(categoria_uso_sk, -1) AS "categoriaId", tipo_local AS tipo, comercializable,
              x, y, w, h, area_m2 AS "areaM2", canon_m2 AS "canonM2", fecha_lanzamiento AS "fechaLanzamiento", descripcion
         FROM gold.dim_local WHERE local_sk > 0 ORDER BY local_sk`),
    q('SELECT planta_sk AS "plantaId", tipo, etiqueta, x, y, w, h FROM gold.ref_elemento_plano ORDER BY orden'),
    q(`SELECT cliente_sk AS id, codigo, nombre_comercial AS "nombreComercial", categoria_sk AS "categoriaId",
              tipo_persona AS "tipoPersona", canal, fecha_alta AS "fechaAlta"
         FROM gold.dim_cliente WHERE cliente_sk > 0 ORDER BY cliente_sk`),
    q('SELECT actividad_id AS id, cliente_sk AS "clienteId", local_sk AS "localId", tipo, fecha, canal FROM gold.fact_actividad ORDER BY actividad_id'),
    q(`SELECT reserva_id AS id, codigo, local_sk AS "localId", cliente_sk AS "clienteId", fecha_reserva AS "fechaReserva",
              fecha_vencimiento AS "fechaVencimiento", fecha_cierre AS "fechaCierre", estado, importe_separacion AS "importeSeparacion"
         FROM gold.fact_reserva ORDER BY reserva_id`),
    q(`SELECT contrato_id AS id, codigo, local_sk AS "localId", cliente_sk AS "clienteId", reserva_id AS "reservaId",
              renovacion_de AS "renovacionDe", 'arriendo' AS tipo, categoria_actividad_sk AS "categoriaId",
              fecha_firma AS "fechaFirma", fecha_inicio AS "fechaInicio", fecha_fin AS "fechaFin", fecha_terminacion AS "fechaTerminacion",
              plazo_meses AS "plazoMeses", area_m2 AS "areaM2", canon_mensual AS "canonMensual", valor_total AS "valorTotal",
              valor_lista AS "valorLista", estado
         FROM gold.fact_contrato ORDER BY contrato_id`),
    q(`SELECT recibo_id AS id, contrato_id AS "contratoId", numero, 'canon' AS concepto, fecha_emision AS "fechaEmision",
              fecha_vencimiento AS "fechaVencimiento", importe
         FROM gold.fact_recibo ORDER BY recibo_id`),
    q(`SELECT pago_id AS id, recibo_id AS "cuotaId", contrato_id AS "contratoId", fecha_pago AS "fechaPago", importe, medio
         FROM gold.fact_pago ORDER BY pago_id`),
  ]);
  return {
    meta: meta(params),
    plantas,
    zonas,
    categorias,
    locales: sinDescripcionNula(locales),
    elementos,
    clientes,
    actividades,
    reservas,
    contratos,
    cuotas,
    pagos,
  } as unknown as Dataset; // la forma se verifica en test/postgres.test.ts (igualdad con lo generado)
}

/** Lee la base OPERATIVA (esquema «comercial»): el origen de los datos, antes del pipeline. */
export async function cargarDatasetOperativo(pool: pg.Pool): Promise<Dataset> {
  const q = async <T = Fila>(sql: string) => (await pool.query(sql)).rows as T[];
  const [params, plantas, zonas, categorias, locales, elementos, clientes, actividades, reservas, contratos, cuotas, pagos] = await Promise.all([
    q<{ clave: string; valor: string }>('SELECT clave, valor FROM comercial.parametros'),
    q('SELECT id, codigo, nombre, nivel, ancho, alto FROM comercial.planta ORDER BY id'),
    q('SELECT id, planta_id AS "plantaId", codigo, nombre, tipo FROM comercial.zona ORDER BY id'),
    q('SELECT id, codigo, nombre, grupo FROM comercial.categoria ORDER BY id'),
    q(`SELECT id, codigo, planta_id AS "plantaId", zona_id AS "zonaId", categoria_id AS "categoriaId", tipo, comercializable,
              x, y, w, h, area_m2 AS "areaM2", canon_m2 AS "canonM2", fecha_lanzamiento AS "fechaLanzamiento", descripcion
         FROM comercial.local ORDER BY id`),
    q('SELECT planta_id AS "plantaId", tipo, etiqueta, x, y, w, h FROM comercial.elemento_plano ORDER BY id'),
    q(`SELECT id, codigo, nombre_comercial AS "nombreComercial", categoria_id AS "categoriaId", tipo_persona AS "tipoPersona",
              canal, fecha_alta AS "fechaAlta" FROM comercial.cliente ORDER BY id`),
    q('SELECT id, cliente_id AS "clienteId", local_id AS "localId", tipo, fecha, canal FROM comercial.actividad ORDER BY id'),
    q(`SELECT id, codigo, local_id AS "localId", cliente_id AS "clienteId", fecha_reserva AS "fechaReserva",
              fecha_vencimiento AS "fechaVencimiento", fecha_cierre AS "fechaCierre", estado, importe_separacion AS "importeSeparacion"
         FROM comercial.reserva ORDER BY id`),
    q(`SELECT id, codigo, local_id AS "localId", cliente_id AS "clienteId", reserva_id AS "reservaId", renovacion_de AS "renovacionDe",
              tipo, categoria_id AS "categoriaId", fecha_firma AS "fechaFirma", fecha_inicio AS "fechaInicio", fecha_fin AS "fechaFin",
              fecha_terminacion AS "fechaTerminacion", plazo_meses AS "plazoMeses", area_m2 AS "areaM2", canon_mensual AS "canonMensual",
              valor_total AS "valorTotal", valor_lista AS "valorLista", estado
         FROM comercial.contrato ORDER BY id`),
    q(`SELECT id, contrato_id AS "contratoId", numero, concepto, fecha_emision AS "fechaEmision", fecha_vencimiento AS "fechaVencimiento", importe
         FROM comercial.cuota ORDER BY id`),
    q('SELECT id, cuota_id AS "cuotaId", contrato_id AS "contratoId", fecha_pago AS "fechaPago", importe, medio FROM comercial.pago ORDER BY id'),
  ]);
  return {
    meta: meta(params),
    plantas,
    zonas,
    categorias,
    locales: sinDescripcionNula(locales),
    elementos,
    clientes,
    actividades,
    reservas,
    contratos,
    cuotas,
    pagos,
  } as unknown as Dataset;
}

/** Informe de la última ejecución del pipeline (para mostrar el origen de los datos). */
export async function informePipeline(pool: pg.Pool): Promise<Fila | null> {
  try {
    const { rows } = await pool.query(
      `SELECT ejecutado_en, lote, segundos, kpis_ok, kpis_fallo, filas_cuarentena
         FROM control.ejecucion_pipeline ORDER BY ejecutado_en DESC LIMIT 1`,
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
