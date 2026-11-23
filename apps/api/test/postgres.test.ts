/**
 * Integración contra PostgreSQL (docker compose) después de ejecutar el pipeline
 * («npm.cmd run demo:restaurar»). Se omite si no hay base o no hay capa Gold.
 *
 *  1. La base operativa es fiel a lo generado.
 *  2. Lo que sale de GOLD (tras Bronze con incidencias → Silver → Gold) es idéntico a lo generado:
 *     la limpieza recupera exactamente los datos y el modelo analítico no pierde ni duplica nada.
 *  3. Los KPI calculados en SQL sobre Gold coinciden con la capa semántica (0 fallos).
 *  4. El rol de la API no puede escribir.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { generarDataset } from '@mli/core';
import { crearPool } from '../src/db.ts';
import { cargarDatasetGold, cargarDatasetOperativo } from '../src/repositorio.ts';

const url = process.env.DATABASE_URL ?? 'postgres://mli_app:mli_app_dev@127.0.0.1:54330/mli';
const pool = crearPool(url);
const hayGold = await pool
  .query('SELECT 1 FROM gold.parametros LIMIT 1')
  .then(() => true)
  .catch(() => false);

afterAll(() => pool.end());

describe.skipIf(!hayGold)('PostgreSQL y capa Gold', () => {
  it('la base operativa es fiel al conjunto generado', async () => {
    const leido = await cargarDatasetOperativo(pool);
    expect(leido).toEqual(generarDataset({ semilla: leido.meta.semilla }));
  });

  it('Gold reconstruye exactamente el conjunto generado (Bronze → Silver → Gold sin pérdidas)', async () => {
    const gold = await cargarDatasetGold(pool);
    expect(gold).toEqual(generarDataset({ semilla: gold.meta.semilla }));
  });

  it('los KPI en SQL sobre Gold coinciden con la capa semántica', async () => {
    const { rows } = await pool.query("SELECT resultado, COUNT(*)::int AS n FROM control.v_validacion_kpi GROUP BY resultado");
    const r = Object.fromEntries(rows.map((x) => [x.resultado, x.n]));
    expect(r.FALLO ?? 0).toBe(0);
    expect(r.OK).toBeGreaterThan(100);
  });

  it('Silver cuadra con el manifiesto y la cuarentena contiene solo las filas inválidas inyectadas', async () => {
    const { rows } = await pool.query('SELECT bool_and(cuadra) AS ok FROM silver.calidad');
    expect(rows[0].ok).toBe(true);
    const q = await pool.query('SELECT regla, COUNT(*)::int AS n FROM silver.cuarentena GROUP BY regla ORDER BY regla');
    expect(q.rows).toEqual([
      { regla: 'huerfana_cliente_id', n: 2 },
      { regla: 'huerfana_cuota_id', n: 1 },
      { regla: 'importe_positivo', n: 1 },
    ]);
  });

  it('el rol de la API no puede escribir', async () => {
    await expect(pool.query("UPDATE gold.parametros SET valor = 'x' WHERE clave = 'nombre'")).rejects.toThrow(/permission denied|permiso denegado/);
    await expect(pool.query("UPDATE comercial.parametros SET valor = 'x' WHERE clave = 'nombre'")).rejects.toThrow(/permission denied|permiso denegado/);
  });
});
