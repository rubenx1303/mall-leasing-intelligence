import type { Categoria, ElementoPlano, Local, Planta, TipoLocal, TipoZona, Zona } from './types.ts';

/**
 * PLANO FICTICIO de demostración (centro comercial inventado; no reproduce ningún plano real).
 * Lienzo de 1200 × 720 unidades por planta; 10 unidades = 1 m, así que
 * la superficie de cada local es exactamente w·h/100 m².
 */

export const ANCHO = 1200;
export const ALTO = 720;

export const CATEGORIAS: Categoria[] = [
  { id: 1, codigo: 'SUP', nombre: 'Supermercado', grupo: 'Ancla' },
  { id: 2, codigo: 'TDP', nombre: 'Tienda por departamentos', grupo: 'Ancla' },
  { id: 3, codigo: 'MOD', nombre: 'Moda y accesorios', grupo: 'Comercio' },
  { id: 4, codigo: 'CAL', nombre: 'Calzado y marroquinería', grupo: 'Comercio' },
  { id: 5, codigo: 'RES', nombre: 'Restaurantes', grupo: 'Restauración' },
  { id: 6, codigo: 'CAF', nombre: 'Cafés y heladerías', grupo: 'Restauración' },
  { id: 7, codigo: 'SAB', nombre: 'Salud y belleza', grupo: 'Servicios' },
  { id: 8, codigo: 'TEC', nombre: 'Tecnología y telefonía', grupo: 'Comercio' },
  { id: 9, codigo: 'HOG', nombre: 'Hogar y decoración', grupo: 'Comercio' },
  { id: 10, codigo: 'SER', nombre: 'Servicios financieros y otros', grupo: 'Servicios' },
  { id: 11, codigo: 'ENT', nombre: 'Entretenimiento y cine', grupo: 'Ocio' },
  { id: 12, codigo: 'DPT', nombre: 'Deportes', grupo: 'Comercio' },
  { id: 13, codigo: 'INF', nombre: 'Infantil y juguetería', grupo: 'Comercio' },
];

const cat = (codigo: string): number => {
  const c = CATEGORIAS.find((x) => x.codigo === codigo);
  if (!c) throw new Error(`Categoría desconocida ${codigo}`);
  return c.id;
};

export interface Plano {
  plantas: Planta[];
  zonas: Zona[];
  locales: Omit<Local, 'canonM2' | 'fechaLanzamiento'>[];
  elementos: ElementoPlano[];
}

/** Renta de lista mensual por m² a la apertura, por zona (COP, ficticia). */
export const RENTA_BASE_M2: Record<string, number> = {
  'P1-PC': 165_000,
  'P1-BC': 120_000,
  'P1-GN': 115_000,
  'P1-GS': 105_000,
  'P2-IS': 130_000,
  'P2-GN': 85_000,
  'P2-FC': 95_000,
};

export function construirPlano(): Plano {
  const plantas: Planta[] = [
    { id: 1, codigo: 'P1', nombre: 'Planta 1', nivel: 1, ancho: ANCHO, alto: ALTO },
    { id: 2, codigo: 'P2', nombre: 'Planta 2', nivel: 2, ancho: ANCHO, alto: ALTO },
  ];
  const zonas: Zona[] = [];
  const locales: Plano['locales'] = [];
  const elementos: ElementoPlano[] = [];

  const zona = (plantaId: number, codigo: string, nombre: string, tipo: TipoZona): number => {
    const id = zonas.length + 1;
    zonas.push({ id, plantaId, codigo, nombre, tipo });
    return id;
  };

  const local = (
    plantaId: number,
    zonaId: number,
    codigo: string,
    tipo: TipoLocal,
    categoria: string | null,
    x: number,
    y: number,
    w: number,
    h: number,
    descripcion?: string,
  ) => {
    const comercializable = tipo !== 'tecnico';
    locales.push({
      id: locales.length + 1,
      codigo,
      plantaId,
      zonaId,
      categoriaId: categoria ? cat(categoria) : null,
      tipo,
      comercializable,
      x,
      y,
      w,
      h,
      areaM2: (w * h) / 100,
      ...(descripcion ? { descripcion } : {}),
    });
  };

  /** Reparte una fila de locales a partir de anchos. */
  const fila = (
    plantaId: number,
    zonaId: number,
    prefijo: string,
    inicio: number,
    x0: number,
    y: number,
    h: number,
    anchos: number[],
    usos: (string | null)[],
  ): number => {
    let x = x0;
    let n = inicio;
    anchos.forEach((w, i) => {
      const uso = usos[i];
      const codigo = `${prefijo}-${String(n).padStart(2, '0')}`;
      if (uso === null) local(plantaId, zonaId, codigo, 'tecnico', null, x, y, w, h, 'Cuarto técnico');
      else local(plantaId, zonaId, codigo, 'local', uso, x, y, w, h);
      x += w;
      n++;
    });
    return n;
  };

  // ---------------- PLANTA 1 ----------------
  const p1 = 1;
  const zA1O = zona(p1, 'P1-AO', 'Ancla Occidente', 'ancla');
  const zA1E = zona(p1, 'P1-AE', 'Ancla Oriente', 'ancla');
  const zGN1 = zona(p1, 'P1-GN', 'Galería Norte', 'galeria');
  const zGS1 = zona(p1, 'P1-GS', 'Galería Sur', 'galeria');
  const zBC1 = zona(p1, 'P1-BC', 'Bloque Central', 'galeria');
  const zPC1 = zona(p1, 'P1-PC', 'Plaza Central', 'plaza');

  local(p1, zA1O, 'P1-AO-01', 'ancla', 'SUP', 20, 20, 220, 680);
  local(p1, zA1E, 'P1-AE-01', 'ancla', 'TDP', 960, 20, 220, 680);

  let n = fila(p1, zGN1, 'P1-GN', 1, 240, 20, 160, [80, 70, 90, 80], ['MOD', 'CAL', 'SAB', 'MOD']);
  fila(p1, zGN1, 'P1-GN', n, 640, 20, 160, [90, 60, 70, 100], ['TEC', 'CAL', 'MOD', 'HOG']);
  n = fila(p1, zGS1, 'P1-GS', 1, 240, 540, 160, [70, 80, 60, 110], ['SER', 'SAB', 'TEC', 'HOG']);
  fila(p1, zGS1, 'P1-GS', n, 640, 540, 160, [80, 40, 90, 110], ['SER', null, 'SAB', 'DPT']);

  // Bloque central: locales espalda con espalda (fachadas a norte y a sur)
  const bcUsos = ['MOD', 'INF', 'CAL', 'TEC', 'MOD', 'SAB', 'INF', 'MOD', 'CAF', 'TEC', 'SER', 'MOD'];
  let k = 0;
  let nbc = 1;
  for (const x0 of [300, 660]) {
    for (const y0 of [300, 360]) {
      for (let i = 0; i < 3; i++) {
        const codigo = `P1-BC-${String(nbc).padStart(2, '0')}`;
        if (nbc === 7) {
          local(p1, zBC1, codigo, 'tecnico', null, x0 + i * 80, y0, 80, 60, 'Administración del centro');
        } else {
          local(p1, zBC1, codigo, 'local', bcUsos[k], x0 + i * 80, y0, 80, 60);
        }
        k++;
        nbc++;
      }
    }
  }
  // Plaza central con islas
  [
    [555, 315, 'CAF'],
    [615, 315, 'TEC'],
    [555, 375, 'SAB'],
    [615, 375, 'SER'],
  ].forEach(([x, y, uso], i) =>
    local(p1, zPC1, `P1-PC-${String(i + 1).padStart(2, '0')}`, 'isla', uso as string, x as number, y as number, 30, 30),
  );

  elementos.push(
    { plantaId: p1, tipo: 'acceso', etiqueta: 'Acceso norte', x: 560, y: 20, w: 80, h: 160 },
    { plantaId: p1, tipo: 'acceso', etiqueta: 'Acceso sur', x: 560, y: 540, w: 80, h: 160 },
    { plantaId: p1, tipo: 'circulacion', etiqueta: 'Galería', x: 240, y: 180, w: 720, h: 120 },
    { plantaId: p1, tipo: 'circulacion', etiqueta: 'Galería', x: 240, y: 420, w: 720, h: 120 },
    { plantaId: p1, tipo: 'circulacion', etiqueta: '', x: 240, y: 300, w: 60, h: 120 },
    { plantaId: p1, tipo: 'circulacion', etiqueta: '', x: 900, y: 300, w: 60, h: 120 },
    { plantaId: p1, tipo: 'plaza', etiqueta: 'Plaza central', x: 540, y: 300, w: 120, h: 120 },
  );

  // ---------------- PLANTA 2 ----------------
  const p2 = 2;
  const zA2O = zona(p2, 'P2-AO', 'Ancla Occidente', 'ancla');
  const zA2E = zona(p2, 'P2-AE', 'Ancla Oriente', 'ancla');
  const zGN2 = zona(p2, 'P2-GN', 'Galería Norte', 'galeria');
  const zIS2 = zona(p2, 'P2-IS', 'Islas', 'plaza');
  const zFC2 = zona(p2, 'P2-FC', 'Plazoleta de comidas', 'comidas');

  local(p2, zA2O, 'P2-AO-01', 'ancla', 'ENT', 20, 20, 220, 680);
  local(p2, zA2E, 'P2-AE-01', 'ancla', 'ENT', 960, 20, 220, 680);
  n = fila(p2, zGN2, 'P2-GN', 1, 240, 20, 160, [100, 60, 80, 80], ['DPT', 'MOD', 'INF', 'HOG']);
  fila(p2, zGN2, 'P2-GN', n, 640, 20, 160, [70, 90, 80, 80], ['TEC', 'MOD', 'DPT', 'SAB']);

  [
    [330, 330, 'CAF'],
    [420, 330, 'TEC'],
    [510, 330, 'SAB'],
    [660, 330, 'CAF'],
    [750, 330, 'SER'],
    [840, 330, 'MOD'],
  ].forEach(([x, y, uso], i) =>
    local(p2, zIS2, `P2-IS-${String(i + 1).padStart(2, '0')}`, 'isla', uso as string, x as number, y as number, 40, 40),
  );

  const fcUsos: (string | null)[] = ['RES', 'RES', 'CAF', 'RES', 'RES', 'RES', null, 'RES', 'CAF', 'RES', 'RES', 'RES'];
  fila(p2, zFC2, 'P2-FC', 1, 240, 600, 100, Array(12).fill(60), fcUsos);

  elementos.push(
    { plantaId: p2, tipo: 'escaleras', etiqueta: 'Escaleras', x: 560, y: 20, w: 80, h: 160 },
    { plantaId: p2, tipo: 'circulacion', etiqueta: 'Galería', x: 240, y: 180, w: 720, h: 240 },
    { plantaId: p2, tipo: 'terraza', etiqueta: 'Zona de mesas', x: 240, y: 420, w: 720, h: 180 },
  );

  return { plantas, zonas, locales, elementos };
}
