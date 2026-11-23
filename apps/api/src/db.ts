import pg from 'pg';

// DATE como texto ISO (sin desplazamientos de zona horaria), BIGINT y NUMERIC como number.
// Los importes son pesos enteros muy por debajo de 2^53, así que la conversión es exacta.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

export function crearPool(url: string | undefined): pg.Pool {
  if (!url) throw new Error('Falta DATABASE_URL (ver .env.example)');
  return new pg.Pool({ connectionString: url, max: 5, options: '-c search_path=comercial' });
}
