import { describe, expect, it } from 'vitest';
import { crearContexto, generarDataset, resumen, type Resumen } from '@mli/core';
import { cop, fecha, mesCorto, pct } from '../src/lib/formato.ts';
import { consultar, fijarDatasetLocal } from '../src/lib/datos.ts';

describe('formato', () => {
  it('importes compactos en COP', () => {
    expect(cop(40_323_940_000)).toBe('$ 40,3 mil M');
    expect(cop(143_200_000)).toBe('$ 143,2 M');
    expect(cop(950_000)).toBe('$ 950.000');
    expect(cop(null)).toBe('—');
  });
  it('porcentajes y fechas', () => {
    expect(pct(0.4975)).toBe('49,8 %');
    expect(fecha('2026-11-20')).toBe('20 nov 2026');
    expect(mesCorto('2026-03')).toBe('mar 26');
  });
});

describe('modo sin servidor', () => {
  it('calcula con la capa semántica sobre el conjunto cargado y aplica los filtros', async () => {
    const ds = generarDataset();
    fijarDatasetLocal(ds);
    const r = await consultar<Resumen>('resumen', { planta: 1, contrato: 'vigente' });
    expect(r).toEqual(resumen(crearContexto(ds, { filtro: { plantaId: 1, estadoContrato: 'vigente' } })));
  });
});
