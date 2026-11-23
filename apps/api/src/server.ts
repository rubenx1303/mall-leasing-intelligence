import type { Dataset } from '@mli/core';
import { crearApp } from './app.ts';
import { crearPool } from './db.ts';
import { cargarDatasetGold, cargarDatasetOperativo, informePipeline } from './repositorio.ts';

/**
 * FUENTE=gold (por defecto): el dashboard lee el MODELO ANALÍTICO generado por el pipeline.
 * FUENTE=operativo: lee directamente la base operativa (útil para comparar).
 */
const fuenteNombre = process.env.FUENTE === 'operativo' ? 'operativo' : 'gold';
const pool = crearPool(process.env.DATABASE_URL);

// Caché breve: el conjunto es pequeño y la API es de solo lectura.
let cache: { ds: Dataset; t: number } | null = null;
const TTL_MS = 30_000;
async function fuente(): Promise<Dataset> {
  if (!cache || Date.now() - cache.t > TTL_MS) {
    const ds = fuenteNombre === 'gold' ? await cargarDatasetGold(pool) : await cargarDatasetOperativo(pool);
    cache = { ds, t: Date.now() };
  }
  return cache.ds;
}

const app = await crearApp({
  fuente,
  nombreFuente: fuenteNombre === 'gold' ? 'gold (PostgreSQL, capa analítica)' : 'operativo (PostgreSQL)',
  infoFuente: () => informePipeline(pool),
  origenesCors: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  logger: true,
});

const port = Number(process.env.API_PORT ?? 8787);
await app.listen({ port, host: '127.0.0.1' });

const cerrar = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
