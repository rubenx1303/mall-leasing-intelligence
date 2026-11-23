import { describe, expect, it } from 'vitest';
import { contratoVigente, fechaSalida, generarDataset, reservaActiva, sumarDias } from '../src/index.ts';

const ds = generarDataset();
const corte = ds.meta.fechaCorte;
const localDe = new Map(ds.locales.map((l) => [l.id, l]));

describe('generador de datos ficticios', () => {
  it('es determinista con la misma semilla', () => {
    expect(JSON.stringify(generarDataset())).toBe(JSON.stringify(ds));
    expect(JSON.stringify(generarDataset({ semilla: 3 }))).not.toBe(JSON.stringify(ds));
  });

  it('declara que el centro y los datos son ficticios', () => {
    expect(ds.meta.ficticio).toBe(true);
    expect(ds.meta.centro).toMatch(/ficticio/);
    expect(ds.meta.aviso).toMatch(/FICTICIOS/);
  });

  it('la superficie sale de la geometría y los locales no se solapan', () => {
    for (const l of ds.locales) expect(l.areaM2).toBeCloseTo((l.w * l.h) / 100, 6);
    for (const a of ds.locales)
      for (const b of ds.locales) {
        if (a.id >= b.id || a.plantaId !== b.plantaId) continue;
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${a.codigo}/${b.codigo}`).toBe(false);
      }
  });

  it('códigos únicos y cada local en una zona de su planta', () => {
    expect(new Set(ds.locales.map((l) => l.codigo)).size).toBe(ds.locales.length);
    for (const l of ds.locales) expect(ds.zonas.find((z) => z.id === l.zonaId)!.plantaId).toBe(l.plantaId);
  });

  it('los contratos de un local no se solapan y solo existen en locales comercializables', () => {
    for (const l of ds.locales) {
      const cs = ds.contratos.filter((c) => c.localId === l.id).sort((a, b) => (a.fechaInicio < b.fechaInicio ? -1 : 1));
      if (!l.comercializable) expect(cs).toHaveLength(0);
      for (let i = 1; i < cs.length; i++) expect(cs[i].fechaInicio >= fechaSalida(cs[i - 1]), `${cs[i - 1].codigo}/${cs[i].codigo}`).toBe(true);
    }
  });

  it('en cualquier fecha hay como máximo un contrato vigente por local', () => {
    for (const d of ['2024-04-15', '2025-01-31', '2025-12-31', corte]) {
      const porLocal = new Map<number, number>();
      for (const c of ds.contratos) if (contratoVigente(c, d)) porLocal.set(c.localId, (porLocal.get(c.localId) ?? 0) + 1);
      for (const n of porLocal.values()) expect(n).toBe(1);
    }
  });

  it('el estado guardado del contrato coincide con sus fechas en el corte', () => {
    for (const c of ds.contratos) {
      if (c.estado === 'vigente') expect(contratoVigente(c, corte)).toBe(true);
      if (c.estado === 'finalizado') expect(c.fechaFin < corte && c.fechaTerminacion === null).toBe(true);
      if (c.estado === 'rescindido') expect(c.fechaTerminacion! <= corte && c.fechaTerminacion! < c.fechaFin).toBe(true);
      expect(c.fechaFirma <= c.fechaInicio || c.renovacionDe === null).toBe(true);
      expect(c.fechaFirma <= corte).toBe(true);
    }
  });

  it('las renovaciones son del mismo inquilino y empiezan al día siguiente del contrato anterior', () => {
    for (const c of ds.contratos.filter((x) => x.renovacionDe)) {
      const prev = ds.contratos.find((p) => p.id === c.renovacionDe)!;
      expect(prev.clienteId).toBe(c.clienteId);
      expect(prev.localId).toBe(c.localId);
      expect(c.fechaInicio).toBe(sumarDias(prev.fechaFin, 1));
    }
  });

  it('nunca hay dos reservas activas a la vez y el estado guardado coincide con las fechas', () => {
    for (const l of ds.locales) {
      const rs = ds.reservas.filter((r) => r.localId === l.id);
      for (const a of rs)
        for (const b of rs) {
          if (a.id >= b.id) continue;
          const finA = a.fechaCierre ?? sumarDias(a.fechaVencimiento, 1);
          const finB = b.fechaCierre ?? sumarDias(b.fechaVencimiento, 1);
          expect(a.fechaReserva < finB && b.fechaReserva < finA, `${a.codigo}/${b.codigo}`).toBe(false);
        }
    }
    for (const r of ds.reservas) expect(r.estado === 'activa').toBe(reservaActiva(r, corte));
  });

  it('una reserva convertida se cierra el día de la firma, dentro de su vigencia', () => {
    for (const c of ds.contratos.filter((x) => x.reservaId)) {
      const r = ds.reservas.find((x) => x.id === c.reservaId)!;
      expect(r.estado).toBe('convertida');
      expect(r.fechaCierre).toBe(c.fechaFirma);
      expect(r.fechaReserva <= c.fechaFirma && c.fechaFirma <= r.fechaVencimiento).toBe(true);
    }
  });

  it('actividades dentro del periodo de comercialización y hasta el corte', () => {
    for (const a of ds.actividades) {
      expect(a.fecha <= corte).toBe(true);
      expect(localDe.get(a.localId)!.comercializable).toBe(true);
    }
  });

  it('Σ recibos = valor total en contratos no rescindidos; recibos mensuales con el canon', () => {
    for (const c of ds.contratos) {
      const qs = ds.cuotas.filter((q) => q.contratoId === c.id);
      for (const q of qs) expect(q.importe).toBe(c.canonMensual);
      if (!c.fechaTerminacion) expect(qs.reduce((s, q) => s + q.importe, 0)).toBe(c.valorTotal);
      else for (const q of qs) expect(q.fechaEmision < c.fechaTerminacion).toBe(true);
    }
  });

  it('los pagos no superan el recibo, son posteriores a su emisión y no posteriores al corte', () => {
    const pagado = new Map<number, number>();
    const cuotaDe = new Map(ds.cuotas.map((q) => [q.id, q]));
    for (const p of ds.pagos) {
      const q = cuotaDe.get(p.cuotaId)!;
      expect(p.contratoId).toBe(q.contratoId);
      expect(p.fechaPago > q.fechaEmision).toBe(true);
      expect(p.fechaPago <= corte).toBe(true);
      pagado.set(q.id, (pagado.get(q.id) ?? 0) + p.importe);
    }
    for (const [id, total] of pagado) expect(total).toBeLessThanOrEqual(cuotaDe.get(id)!.importe);
  });

  it('importes enteros en COP', () => {
    for (const x of [...ds.contratos.map((c) => c.canonMensual), ...ds.cuotas.map((q) => q.importe), ...ds.pagos.map((p) => p.importe)])
      expect(Number.isInteger(x)).toBe(true);
  });

  it('los inquilinos no contienen datos personales', () => {
    for (const c of ds.clientes) {
      expect(Object.keys(c).sort()).toEqual(['canal', 'categoriaId', 'codigo', 'fechaAlta', 'id', 'nombreComercial', 'tipoPersona']);
    }
  });

  it('el escenario contiene las situaciones pedidas para la demo', () => {
    expect(ds.contratos.some((c) => c.estado === 'vigente')).toBe(true);
    expect(ds.contratos.some((c) => c.estado === 'finalizado')).toBe(true);
    expect(ds.contratos.some((c) => c.estado === 'rescindido')).toBe(true);
    expect(ds.contratos.some((c) => c.renovacionDe !== null)).toBe(true);
    expect(ds.reservas.some((r) => r.estado === 'activa')).toBe(true);
  });
});
