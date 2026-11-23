/**
 * Instantánea del MODELO ANALÍTICO para el modo sin servidor de la web: lee la capa Gold
 * (PostgreSQL) y la guarda en apps/web/public/demo/gold.json junto con el informe del pipeline.
 * Así la demo estática muestra exactamente los datos de Gold, no datos generados en el navegador.
 * Uso: npm run instantanea -w @mli/api
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { crearPool } from '../src/db.ts';
import { cargarDatasetGold, informePipeline } from '../src/repositorio.ts';

const pool = crearPool(process.env.DATABASE_URL);
try {
  const ds = await cargarDatasetGold(pool);
  const origen = await informePipeline(pool);
  const dir = fileURLToPath(new URL('../../web/public/demo/', import.meta.url));
  await mkdir(dir, { recursive: true });
  const json = JSON.stringify({ origen, dataset: ds });
  await writeFile(`${dir}gold.json`, json, 'utf8');
  console.log(`Instantánea de Gold: ${(json.length / 1024).toFixed(0)} KB → apps/web/public/demo/gold.json`);
} finally {
  await pool.end();
}
