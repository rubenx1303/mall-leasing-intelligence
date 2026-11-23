/**
 * Crea el esquema operativo y carga el conjunto de datos FICTICIO.
 * Uso: npm run db:seed  (requiere DATABASE_ADMIN_URL; la API usa un rol de solo lectura)
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { generarDataset } from '@mli/core';
import { crearPool } from '../src/db.ts';

const semilla = process.env.SEMILLA ? Number(process.env.SEMILLA) : undefined;
const ds = generarDataset({ semilla });
const pool = crearPool(process.env.DATABASE_ADMIN_URL);
const ruta = (f: string) => fileURLToPath(new URL(`../db/${f}`, import.meta.url));

async function insertar(client: import('pg').PoolClient, tabla: string, columnas: string[], filas: unknown[][]) {
  const LOTE = 500;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const valores: unknown[] = [];
    const tuplas = lote.map((f) => {
      const ph = f.map((v) => {
        valores.push(v);
        return `$${valores.length}`;
      });
      return `(${ph.join(',')})`;
    });
    await client.query(`INSERT INTO ${tabla} (${columnas.join(',')}) VALUES ${tuplas.join(',')}`, valores);
  }
}

const client = await pool.connect();
try {
  await client.query(await readFile(ruta('schema.sql'), 'utf8'));
  await client.query('BEGIN');
  await client.query('SET search_path = comercial');

  const m = ds.meta;
  await insertar(client, 'parametros', ['clave', 'valor'], [
    ['nombre', m.nombre],
    ['centro', m.centro],
    ['version', m.version],
    ['semilla', String(m.semilla)],
    ['fecha_corte', m.fechaCorte],
    ['fecha_apertura', m.fechaApertura],
    ['aviso', m.aviso],
  ]);
  await insertar(client, 'planta', ['id', 'codigo', 'nombre', 'nivel', 'ancho', 'alto'],
    ds.plantas.map((p) => [p.id, p.codigo, p.nombre, p.nivel, p.ancho, p.alto]));
  await insertar(client, 'zona', ['id', 'planta_id', 'codigo', 'nombre', 'tipo'],
    ds.zonas.map((z) => [z.id, z.plantaId, z.codigo, z.nombre, z.tipo]));
  await insertar(client, 'categoria', ['id', 'codigo', 'nombre', 'grupo'],
    ds.categorias.map((c) => [c.id, c.codigo, c.nombre, c.grupo]));
  await insertar(client, 'local',
    ['id', 'codigo', 'planta_id', 'zona_id', 'categoria_id', 'tipo', 'comercializable', 'x', 'y', 'w', 'h', 'area_m2',
      'canon_m2', 'fecha_lanzamiento', 'descripcion'],
    ds.locales.map((l) => [l.id, l.codigo, l.plantaId, l.zonaId, l.categoriaId, l.tipo, l.comercializable, l.x, l.y, l.w, l.h,
      l.areaM2, l.canonM2, l.fechaLanzamiento, l.descripcion ?? null]));
  await insertar(client, 'elemento_plano', ['planta_id', 'tipo', 'etiqueta', 'x', 'y', 'w', 'h'],
    ds.elementos.map((e) => [e.plantaId, e.tipo, e.etiqueta, e.x, e.y, e.w, e.h]));
  await insertar(client, 'cliente', ['id', 'codigo', 'nombre_comercial', 'categoria_id', 'tipo_persona', 'canal', 'fecha_alta'],
    ds.clientes.map((c) => [c.id, c.codigo, c.nombreComercial, c.categoriaId, c.tipoPersona, c.canal, c.fechaAlta]));
  await insertar(client, 'actividad', ['id', 'cliente_id', 'local_id', 'tipo', 'fecha', 'canal'],
    ds.actividades.map((a) => [a.id, a.clienteId, a.localId, a.tipo, a.fecha, a.canal]));
  await insertar(client, 'reserva',
    ['id', 'codigo', 'local_id', 'cliente_id', 'fecha_reserva', 'fecha_vencimiento', 'fecha_cierre', 'estado', 'importe_separacion'],
    ds.reservas.map((r) => [r.id, r.codigo, r.localId, r.clienteId, r.fechaReserva, r.fechaVencimiento, r.fechaCierre, r.estado, r.importeSeparacion]));
  await insertar(client, 'contrato',
    ['id', 'codigo', 'local_id', 'cliente_id', 'reserva_id', 'renovacion_de', 'tipo', 'categoria_id', 'fecha_firma', 'fecha_inicio',
      'fecha_fin', 'fecha_terminacion', 'plazo_meses', 'area_m2', 'canon_mensual', 'valor_total', 'valor_lista', 'estado'],
    ds.contratos.map((c) => [c.id, c.codigo, c.localId, c.clienteId, c.reservaId, c.renovacionDe, c.tipo, c.categoriaId, c.fechaFirma,
      c.fechaInicio, c.fechaFin, c.fechaTerminacion, c.plazoMeses, c.areaM2, c.canonMensual, c.valorTotal, c.valorLista, c.estado]));
  await insertar(client, 'cuota', ['id', 'contrato_id', 'numero', 'concepto', 'fecha_emision', 'fecha_vencimiento', 'importe'],
    ds.cuotas.map((q) => [q.id, q.contratoId, q.numero, q.concepto, q.fechaEmision, q.fechaVencimiento, q.importe]));
  await insertar(client, 'pago', ['id', 'cuota_id', 'contrato_id', 'fecha_pago', 'importe', 'medio'],
    ds.pagos.map((p) => [p.id, p.cuotaId, p.contratoId, p.fechaPago, p.importe, p.medio]));

  // Rol de la API: solo lectura (si existe; lo crea db/00-roles.sql al iniciar el contenedor).
  await client.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mli_app') THEN
      GRANT USAGE ON SCHEMA comercial TO mli_app;
      GRANT SELECT ON ALL TABLES IN SCHEMA comercial TO mli_app;
    END IF; END $$`);
  await client.query('COMMIT');
  console.log(
    `Semilla ${m.semilla} cargada: ${ds.locales.length} locales, ${ds.clientes.length} interesados, ${ds.reservas.length} reservas, ` +
      `${ds.contratos.length} contratos, ${ds.cuotas.length} cuotas, ${ds.pagos.length} pagos (corte ${m.fechaCorte}).`,
  );
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  throw e;
} finally {
  client.release();
  await pool.end();
}
