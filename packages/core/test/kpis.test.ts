import { describe, expect, it } from 'vitest';
import {
  alertas,
  analisisComercial,
  analisisFinanciero,
  crearContexto,
  generarDataset,
  localesVista,
  resumen,
  type Dataset,
} from '../src/index.ts';

/** Conjunto mínimo construido a mano con resultados calculables de cabeza. */
function datasetMinimo(): Dataset {
  const base = { plantaId: 1, zonaId: 1, tipo: 'local' as const, x: 0, y: 0, w: 10, h: 10, canonM2: 10 };
  const ctr = (o: Partial<Dataset['contratos'][number]> & { id: number; localId: number }) => ({
    codigo: `CTR-${o.id}`,
    clienteId: 1,
    reservaId: null,
    renovacionDe: null,
    tipo: 'arriendo' as const,
    categoriaId: 3,
    fechaFirma: '2026-01-01',
    fechaInicio: '2026-01-01',
    fechaFin: '2026-12-31',
    fechaTerminacion: null,
    plazoMeses: 12,
    areaM2: 100,
    canonMensual: 1000,
    valorTotal: 12000,
    valorLista: 12000,
    estado: 'vigente' as const,
    ...o,
  });
  return {
    meta: {
      nombre: 'mínimo',
      centro: 'Centro de prueba (ficticio)',
      version: 't',
      ficticio: true,
      semilla: 0,
      moneda: 'COP',
      fechaCorte: '2026-03-20',
      fechaApertura: '2026-01-01',
      aviso: 'FICTICIOS',
    },
    plantas: [{ id: 1, codigo: 'P1', nombre: 'Planta 1', nivel: 1, ancho: 100, alto: 100 }],
    zonas: [{ id: 1, plantaId: 1, codigo: 'Z', nombre: 'Zona', tipo: 'galeria' }],
    categorias: [{ id: 3, codigo: 'MOD', nombre: 'Moda', grupo: 'Comercio' }],
    elementos: [],
    locales: [
      { ...base, id: 1, codigo: 'A', categoriaId: 3, comercializable: true, areaM2: 100, fechaLanzamiento: '2026-01-01' },
      { ...base, id: 2, codigo: 'B', categoriaId: 3, comercializable: true, areaM2: 50, fechaLanzamiento: '2026-01-01' },
      { ...base, id: 3, codigo: 'C', categoriaId: 3, comercializable: true, areaM2: 200, fechaLanzamiento: '2026-01-01' },
      { ...base, id: 4, codigo: 'D', categoriaId: null, tipo: 'tecnico', comercializable: false, areaM2: 30, canonM2: 0, fechaLanzamiento: null },
    ],
    clientes: [
      { id: 1, codigo: 'CLI-1', nombreComercial: 'Uno', categoriaId: 3, tipoPersona: 'juridica', canal: 'web', fechaAlta: '2025-12-01' },
      { id: 2, codigo: 'CLI-2', nombreComercial: 'Dos', categoriaId: 3, tipoPersona: 'juridica', canal: 'web', fechaAlta: '2026-03-01' },
    ],
    actividades: [{ id: 1, clienteId: 2, localId: 2, tipo: 'lead', fecha: '2026-03-01', canal: 'web' }],
    reservas: [
      { id: 1, codigo: 'R1', localId: 2, clienteId: 2, fechaReserva: '2026-03-10', fechaVencimiento: '2026-04-09', fechaCierre: null, estado: 'activa', importeSeparacion: 7 },
    ],
    // A: contrato de 12 meses (vigente) · C: contrato que acaba el 15-may (por vencer, 56 días)
    contratos: [
      ctr({ id: 1, localId: 1, areaM2: 100, canonMensual: 1000, valorTotal: 12000 }),
      ctr({ id: 2, localId: 3, areaM2: 200, canonMensual: 2000, fechaFin: '2026-05-15', plazoMeses: 4, valorTotal: 8000, valorLista: 10000 }),
    ],
    // Recibos de enero a marzo de cada contrato; el de C de marzo sin pagar y el de A de marzo aún no vencido
    cuotas: [
      { id: 1, contratoId: 1, numero: 1, concepto: 'canon', fechaEmision: '2026-01-01', fechaVencimiento: '2026-01-10', importe: 1000 },
      { id: 2, contratoId: 1, numero: 2, concepto: 'canon', fechaEmision: '2026-02-01', fechaVencimiento: '2026-02-10', importe: 1000 },
      { id: 3, contratoId: 1, numero: 3, concepto: 'canon', fechaEmision: '2026-03-01', fechaVencimiento: '2026-03-25', importe: 1000 },
      { id: 4, contratoId: 2, numero: 1, concepto: 'canon', fechaEmision: '2026-01-01', fechaVencimiento: '2026-01-10', importe: 2000 },
      { id: 5, contratoId: 2, numero: 2, concepto: 'canon', fechaEmision: '2026-02-01', fechaVencimiento: '2026-02-10', importe: 2000 },
      { id: 6, contratoId: 2, numero: 3, concepto: 'canon', fechaEmision: '2026-03-01', fechaVencimiento: '2026-03-10', importe: 2000 },
      { id: 7, contratoId: 2, numero: 4, concepto: 'canon', fechaEmision: '2026-04-01', fechaVencimiento: '2026-04-10', importe: 2000 },
    ],
    pagos: [
      { id: 1, cuotaId: 1, contratoId: 1, fechaPago: '2026-01-05', importe: 1000, medio: 'pse' },
      { id: 2, cuotaId: 2, contratoId: 1, fechaPago: '2026-02-05', importe: 1000, medio: 'pse' },
      { id: 3, cuotaId: 4, contratoId: 2, fechaPago: '2026-01-08', importe: 2000, medio: 'pse' },
      { id: 4, cuotaId: 5, contratoId: 2, fechaPago: '2026-02-20', importe: 1500, medio: 'pse' },
    ],
  };
}

describe('resumen (conjunto mínimo)', () => {
  const ds = datasetMinimo();
  const r = resumen(crearContexto(ds));

  it('clasifica ocupado / reservado / disponible sin contar la reserva como ocupación', () => {
    expect(r.unidades).toEqual({ total: 4, comercializables: 3, ocupados: 2, reservados: 1, disponibles: 0, noComercializables: 1 });
    expect(r.superficie.ocupada).toBe(300);
    expect(r.pctOcupacion).toBeCloseTo(300 / 350, 10);
  });

  it('renta mensual, renta por m² y contratos por vencer', () => {
    expect(r.renta.mensual).toBe(3000);
    expect(r.renta.porM2).toBe(10);
    expect(r.contratos.vigentes).toBe(2);
    expect(r.contratos.porVencer90).toBe(1);
    expect(r.renta.enRiesgo90).toBe(2000);
  });

  it('separa facturado, cobrado, pendiente y vencido', () => {
    expect(r.financiero.facturadoTotal).toBe(9000); // 3 recibos de A + 3 de C emitidos
    expect(r.financiero.cobradoTotal).toBe(5500);
    expect(r.financiero.pendienteCobro).toBe(3500);
    // vencidos: C feb (500 de saldo) y C mar (2000); A mar vence el 25 → aún no
    expect(r.financiero.vencido).toBe(2500);
    expect(r.financiero.tasaMorosidad).toBeCloseTo(2500 / 9000, 10);
    expect(r.financiero.facturadoMes).toBe(3000);
    expect(r.financiero.separacionesActivas).toBe(7);
  });

  it('consulta el pasado con otra fecha de corte', () => {
    const feb = resumen(crearContexto(ds, { corte: '2026-02-15' }));
    expect(feb.financiero.facturadoTotal).toBe(6000);
    expect(feb.financiero.cobradoTotal).toBe(4000);
    expect(feb.financiero.vencido).toBe(2000); // C feb vencido el 10 y pagado el 20
    expect(feb.unidades.reservados).toBe(0);
  });

  it('filtra por estado del contrato', () => {
    const pv = crearContexto(ds, { filtro: { estadoContrato: 'por_vencer' } });
    expect(pv.locales.map((l) => l.codigo)).toEqual(['C']);
    const sin = crearContexto(ds, { filtro: { estadoContrato: 'sin_contrato' } });
    expect(sin.locales.map((l) => l.codigo)).toEqual(['B', 'D']);
  });

  it('filtra por tipo de local', () => {
    expect(crearContexto(ds, { filtro: { tipoLocal: 'tecnico' } }).locales.map((l) => l.codigo)).toEqual(['D']);
  });

  it('alertas: contrato por vencer y pago vencido', () => {
    const a = alertas(crearContexto(ds));
    expect(a.find((x) => x.tipo === 'contrato_por_vencer')?.valor).toBe(56);
    expect(a.find((x) => x.tipo === 'pago_vencido')?.valor).toBe(2500);
  });

  it('antigüedad de la deuda en su tramo', () => {
    const f = analisisFinanciero(crearContexto(ds));
    expect(f.antiguedad.find((t) => t.tramo === '1–30 días')!.importe).toBe(2000); // 10 días
    expect(f.antiguedad.find((t) => t.tramo === '31–60 días')!.importe).toBe(500); // 38 días
  });
});

describe('coherencia sobre el conjunto de demostración', () => {
  const ds = generarDataset();
  const ctx = crearContexto(ds);
  const r = resumen(ctx);
  const c = analisisComercial(ctx);

  it('las unidades por estado suman el total', () => {
    const u = r.unidades;
    expect(u.ocupados + u.reservados + u.disponibles).toBe(u.comercializables);
    expect(u.comercializables + u.noComercializables).toBe(u.total);
  });

  it('cobrado ≤ facturado y vencido ≤ pendiente', () => {
    expect(r.financiero.cobradoTotal).toBeLessThanOrEqual(r.financiero.facturadoTotal);
    expect(r.financiero.vencido).toBeLessThanOrEqual(r.financiero.pendienteCobro);
  });

  it('plantas y zonas cuadran con el total', () => {
    const sumaP = (k: 'areaOcupada' | 'rentaMensual' | 'vencido') => c.porPlanta.reduce((s, p) => s + p[k], 0);
    const sumaZ = (k: 'areaOcupada' | 'rentaMensual' | 'vencido') => c.porZona.reduce((s, z) => s + z[k], 0);
    expect(sumaP('areaOcupada')).toBeCloseTo(r.superficie.ocupada, 6);
    expect(sumaZ('areaOcupada')).toBeCloseTo(r.superficie.ocupada, 6);
    expect(sumaP('rentaMensual')).toBe(r.renta.mensual);
    expect(sumaZ('rentaMensual')).toBe(r.renta.mensual);
    expect(sumaZ('vencido')).toBe(r.financiero.vencido);
  });

  it('la evolución termina en la ocupación y la renta actuales', () => {
    const u = c.evolucion.at(-1)!;
    expect(u.pctOcupacion).toBeCloseTo(r.pctOcupacion!, 10);
    expect(u.rentaMensual).toBe(r.renta.mensual);
  });

  it('el facturado y cobrado mensual suman los totales', () => {
    const f = analisisFinanciero(ctx);
    expect(f.mensual.reduce((s, m) => s + m.facturado, 0)).toBe(r.financiero.facturadoTotal);
    expect(f.mensual.reduce((s, m) => s + m.cobrado, 0)).toBe(r.financiero.cobradoTotal);
    expect(f.antiguedad.reduce((s, t) => s + t.importe, 0)).toBe(r.financiero.vencido);
  });

  it('los filtros por planta se reparten el total', () => {
    const p1 = resumen(crearContexto(ds, { filtro: { plantaId: 1 } }));
    const p2 = resumen(crearContexto(ds, { filtro: { plantaId: 2 } }));
    expect(p1.renta.mensual + p2.renta.mensual).toBe(r.renta.mensual);
    expect(p1.financiero.facturadoTotal + p2.financiero.facturadoTotal).toBe(r.financiero.facturadoTotal);
  });

  it('los filtros de estado del contrato forman una partición', () => {
    const n = (e: 'vigente' | 'por_vencer' | 'sin_contrato') => crearContexto(ds, { filtro: { estadoContrato: e } }).locales.length;
    expect(n('vigente') + n('por_vencer') + n('sin_contrato')).toBe(ds.locales.length);
    expect(n('por_vencer')).toBe(r.contratos.porVencer90);
  });

  it('el escenario incluye todos los tipos de alerta relevantes', () => {
    const tipos = new Set(alertas(ctx).map((a) => a.tipo));
    for (const t of ['contrato_por_vencer', 'pago_vencido', 'reserva_por_vencer', 'local_vacio_prolongado', 'zona_baja_ocupacion'])
      expect(tipos.has(t as never), t).toBe(true);
  });

  it('la vista de locales tiene un registro por local', () => {
    const v = localesVista(ctx);
    expect(v).toHaveLength(ds.locales.length);
    expect(v.filter((l) => l.estado === 'ocupado')).toHaveLength(r.unidades.ocupados);
  });
});
