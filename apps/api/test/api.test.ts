import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { crearContexto, generarDataset, resumen } from '@mli/core';
import { crearApp } from '../src/app.ts';

const ds = generarDataset();
let app: FastifyInstance;

beforeAll(async () => {
  app = await crearApp({ fuente: async () => ds, nombreFuente: 'memoria' });
});
afterAll(() => app.close());

describe('API REST', () => {
  it('salud indica fuente y datos ficticios', async () => {
    const r = await app.inject('/api/salud');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true, fuente: 'memoria', ficticio: true });
  });

  it('resumen coincide con el núcleo', async () => {
    const r = await app.inject('/api/resumen');
    expect(r.json()).toEqual(JSON.parse(JSON.stringify(resumen(crearContexto(ds)))));
  });

  it('aplica filtros y fecha de corte', async () => {
    const r = await app.inject('/api/resumen?planta=2&corte=2026-06-30');
    const esperado = resumen(crearContexto(ds, { corte: '2026-06-30', filtro: { plantaId: 2 } }));
    expect(r.json().unidades).toEqual(esperado.unidades);
    expect(r.json().corte).toBe('2026-06-30');
  });

  it('aplica los filtros de tipo de local y estado del contrato', async () => {
    const pv = (await app.inject('/api/locales?contrato=por_vencer')).json() as { estadoContrato: string }[];
    expect(pv.length).toBe(resumen(crearContexto(ds)).contratos.porVencer90);
    expect(pv.every((l) => l.estadoContrato === 'por_vencer')).toBe(true);
    const islas = (await app.inject('/api/locales?tipo=isla')).json() as { tipo: string }[];
    expect(islas.length).toBeGreaterThan(0);
    expect(islas.every((l) => l.tipo === 'isla')).toBe(true);
    expect((await app.inject('/api/resumen?contrato=otro')).statusCode).toBe(400);
  });

  it('filtra locales por estado', async () => {
    const r = await app.inject('/api/locales?estado=reservado');
    const filas = r.json() as { estado: string }[];
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.every((f) => f.estado === 'reservado')).toBe(true);
  });

  it('devuelve el detalle de un local y 404 si no existe', async () => {
    expect((await app.inject('/api/locales/P1-AO-01')).statusCode).toBe(200);
    expect((await app.inject('/api/locales/NO-EXISTE')).statusCode).toBe(404);
  });

  it('rechaza parámetros no válidos', async () => {
    expect((await app.inject('/api/resumen?corte=ayer')).statusCode).toBe(400);
    expect((await app.inject('/api/resumen?planta=abc')).statusCode).toBe(400);
    expect((await app.inject('/api/resumen?sql=1')).statusCode).toBe(400);
  });

  it('solo expone métodos de lectura', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/resumen' })).statusCode).toBe(404);
  });

  it('comercial, financiero y alertas responden', async () => {
    for (const url of ['/api/comercial', '/api/financiero', '/api/alertas', '/api/catalogos']) {
      expect((await app.inject(url)).statusCode, url).toBe(200);
    }
  });
});
