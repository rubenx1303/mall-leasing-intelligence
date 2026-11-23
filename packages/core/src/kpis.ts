import { diasEntre, finDeMes, mesDe, mesesEntre, sumarDias, sumarMeses } from './fechas.ts';
import {
  DIAS_POR_VENCER,
  type Contrato,
  type Cuota,
  type Dataset,
  type EstadoComercial,
  type EstadoContractual,
  type Filtro,
  type ISODate,
  type Local,
  type Reserva,
} from './types.ts';

/**
 * Indicadores del centro comercial (capa semántica). Todo se evalúa «a fecha de corte» a
 * partir de las fechas de los hechos, de modo que se puede consultar cualquier mes pasado.
 * Definiciones en docs/kpis.md. Las vistas SQL de Gold reproducen los principales y una
 * prueba comprueba que coinciden.
 */

export interface Contexto {
  ds: Dataset;
  corte: ISODate;
  filtro: Filtro;
  locales: Local[];
  localIds: Set<number>;
  estados: Map<number, InfoEstado>;
}

export interface InfoEstado {
  estado: EstadoComercial;
  contractual: EstadoContractual;
  contrato?: Contrato;
  reserva?: Reserva;
}

export function reservaActiva(r: Reserva, d: ISODate): boolean {
  return r.fechaReserva <= d && d <= r.fechaVencimiento && (r.fechaCierre === null || d < r.fechaCierre);
}

export function contratoVigente(c: Contrato, d: ISODate): boolean {
  return c.fechaInicio <= d && d <= c.fechaFin && (c.fechaTerminacion === null || d < c.fechaTerminacion);
}

/** Fecha en que el contrato deja de estar vigente (día siguiente al fin o día de la rescisión). */
export function fechaSalida(c: Contrato): ISODate {
  return c.fechaTerminacion ?? sumarDias(c.fechaFin, 1);
}

export function estadosEn(ds: Dataset, d: ISODate, locales: Local[] = ds.locales): Map<number, InfoEstado> {
  const vigente = new Map<number, Contrato>();
  for (const c of ds.contratos) if (contratoVigente(c, d)) vigente.set(c.localId, c);
  const reserva = new Map<number, Reserva>();
  for (const r of ds.reservas) if (reservaActiva(r, d)) reserva.set(r.localId, r);
  const out = new Map<number, InfoEstado>();
  for (const l of locales) {
    if (!l.comercializable) out.set(l.id, { estado: 'no_comercializable', contractual: 'sin_contrato' });
    else if (vigente.has(l.id)) {
      const c = vigente.get(l.id)!;
      out.set(l.id, { estado: 'ocupado', contractual: diasEntre(d, c.fechaFin) <= DIAS_POR_VENCER ? 'por_vencer' : 'vigente', contrato: c });
    } else if (reserva.has(l.id)) out.set(l.id, { estado: 'reservado', contractual: 'sin_contrato', reserva: reserva.get(l.id) });
    else out.set(l.id, { estado: 'disponible', contractual: 'sin_contrato' });
  }
  return out;
}

export function crearContexto(ds: Dataset, opciones: { corte?: ISODate; filtro?: Filtro } = {}): Contexto {
  const corte = opciones.corte && opciones.corte < ds.meta.fechaCorte ? opciones.corte : ds.meta.fechaCorte;
  const f = opciones.filtro ?? {};
  let locales = ds.locales.filter(
    (l) =>
      (f.plantaId === undefined || l.plantaId === f.plantaId) &&
      (f.zonaId === undefined || l.zonaId === f.zonaId) &&
      (f.categoriaId === undefined || l.categoriaId === f.categoriaId) &&
      (f.tipoLocal === undefined || l.tipo === f.tipoLocal),
  );
  let estados = estadosEn(ds, corte, locales);
  if (f.estadoContrato) {
    locales = locales.filter((l) => estados.get(l.id)!.contractual === f.estadoContrato);
    estados = new Map(locales.map((l) => [l.id, estados.get(l.id)!]));
  }
  return { ds, corte, filtro: f, locales, localIds: new Set(locales.map((l) => l.id)), estados };
}

const suma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const media = (xs: number[]) => (xs.length ? suma(xs) / xs.length : null);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export interface CuotaConSaldo extends Cuota {
  pagado: number;
  saldo: number;
}

/** Recibos de los locales del filtro (de cualquier contrato) con lo pagado hasta el corte. */
export function cuotasConSaldo(ctx: Contexto, contratos?: Contrato[]): CuotaConSaldo[] {
  const ids = new Set((contratos ?? ctx.ds.contratos.filter((c) => ctx.localIds.has(c.localId))).map((c) => c.id));
  const pagado = new Map<number, number>();
  for (const p of ctx.ds.pagos) {
    if (ids.has(p.contratoId) && p.fechaPago <= ctx.corte) pagado.set(p.cuotaId, (pagado.get(p.cuotaId) ?? 0) + p.importe);
  }
  return ctx.ds.cuotas
    .filter((q) => ids.has(q.contratoId))
    .map((q) => {
      const pg = pagado.get(q.id) ?? 0;
      return { ...q, pagado: pg, saldo: q.importe - pg };
    });
}

export function contratosVigentes(ctx: Contexto): Contrato[] {
  return ctx.ds.contratos.filter((c) => ctx.localIds.has(c.localId) && contratoVigente(c, ctx.corte));
}

/** Meses restantes (fraccionados) de un contrato vigente en el corte. */
const mesesRestantes = (c: Contrato, corte: ISODate) => Math.max(0, diasEntre(corte, c.fechaFin)) / 30.4375;

// ---------------------------------------------------------------- RESUMEN

export interface Resumen {
  corte: ISODate;
  unidades: { total: number; comercializables: number; ocupados: number; reservados: number; disponibles: number; noComercializables: number };
  superficie: { total: number; comercializable: number; ocupada: number; reservada: number; disponible: number };
  /** m² ocupados / m² comercializables */
  pctOcupacion: number | null;
  pctOcupacionUnidades: number | null;
  contratos: {
    vigentes: number;
    porVencer90: number;
    porVencer180: number;
    /** Plazo restante medio ponderado por renta (meses). */
    waltMeses: number | null;
  };
  renta: {
    /** Renta mensual de los contratos vigentes. */
    mensual: number;
    /** Renta mensual / m² ocupados. */
    porM2: number | null;
    /** Renta mensual de los contratos que vencen en ≤ 90 días (en riesgo). */
    enRiesgo90: number;
  };
  financiero: {
    facturadoMes: number;
    facturado12m: number;
    cobrado12m: number;
    facturadoTotal: number;
    cobradoTotal: number;
    pendienteCobro: number;
    vencido: number;
    /** Vencido / facturado de los últimos 12 meses. */
    tasaMorosidad: number | null;
    /** Cobrado de los recibos de los últimos 12 meses / facturado de esos recibos. */
    tasaCobro12m: number | null;
    separacionesActivas: number;
  };
  comercial: {
    altas12m: number;
    renovaciones12m: number;
    bajas12m: number;
    tasaRenovacion: number | null;
    tiempoMedioVacioDias: number | null;
    conversionReservas: number | null;
    interesados12m: number;
    descuentoMedio: number | null;
  };
}

export function resumen(ctx: Contexto): Resumen {
  const { corte, ds } = ctx;
  const u = { total: 0, comercializables: 0, ocupados: 0, reservados: 0, disponibles: 0, noComercializables: 0 };
  const s = { total: 0, comercializable: 0, ocupada: 0, reservada: 0, disponible: 0 };
  let separaciones = 0;
  for (const l of ctx.locales) {
    const e = ctx.estados.get(l.id)!;
    u.total++;
    s.total += l.areaM2;
    if (e.estado === 'no_comercializable') {
      u.noComercializables++;
      continue;
    }
    u.comercializables++;
    s.comercializable += l.areaM2;
    if (e.estado === 'ocupado') {
      u.ocupados++;
      s.ocupada += l.areaM2;
    } else if (e.estado === 'reservado') {
      u.reservados++;
      s.reservada += l.areaM2;
      separaciones += e.reserva!.importeSeparacion;
    } else {
      u.disponibles++;
      s.disponible += l.areaM2;
    }
  }

  const vig = contratosVigentes(ctx);
  const mensual = suma(vig.map((c) => c.canonMensual));
  const dias = (c: Contrato) => diasEntre(corte, c.fechaFin);
  const desde12 = sumarMeses(corte, -12);

  const cuotas = cuotasConSaldo(ctx);
  const emitidas = cuotas.filter((q) => q.fechaEmision <= corte);
  const ult12 = emitidas.filter((q) => q.fechaEmision > desde12);
  const facturado12m = suma(ult12.map((q) => q.importe));
  const vencido = suma(cuotas.filter((q) => q.fechaVencimiento < corte).map((q) => Math.max(0, q.saldo)));
  const contratoIds = new Set(cuotas.map((q) => q.contratoId));
  const pagos = ds.pagos.filter((p) => contratoIds.has(p.contratoId) && p.fechaPago <= corte);

  // Movimientos de los últimos 12 meses
  const delFiltro = ds.contratos.filter((c) => ctx.localIds.has(c.localId));
  const en12 = (f: ISODate) => f > desde12 && f <= corte;
  const altas12m = delFiltro.filter((c) => !c.renovacionDe && en12(c.fechaInicio)).length;
  const renovaciones12m = delFiltro.filter((c) => c.renovacionDe && en12(c.fechaInicio)).length;
  const renovados = new Set(delFiltro.filter((c) => c.renovacionDe && c.fechaFirma <= corte).map((c) => c.renovacionDe!));
  const terminados = delFiltro.filter((c) => fechaSalida(c) <= corte);
  const bajas = terminados.filter((c) => !renovados.has(c.id));
  const finalizadosPlazo = terminados.filter((c) => !c.fechaTerminacion);

  // Vacíos cerrados por un contrato nuevo (no renovación): días desde que quedó libre
  const vacios: number[] = [];
  for (const c of delFiltro) {
    if (c.renovacionDe || c.fechaInicio > corte) continue;
    const previos = delFiltro.filter((p) => p.localId === c.localId && fechaSalida(p) <= c.fechaInicio);
    const libre = previos.length ? previos.map(fechaSalida).sort().at(-1)! : ds.locales.find((l) => l.id === c.localId)!.fechaLanzamiento!;
    const d = diasEntre(libre, c.fechaInicio);
    if (d > 0) vacios.push(d);
  }

  // Conversión de reservas cerradas en el corte
  const contratoPorReserva = new Map(ds.contratos.filter((c) => c.reservaId !== null).map((c) => [c.reservaId!, c]));
  let convertidas = 0;
  let fallidas = 0;
  for (const r of ds.reservas) {
    if (!ctx.localIds.has(r.localId) || r.fechaCierre === null || r.fechaCierre > corte) continue;
    const c = contratoPorReserva.get(r.id);
    if (c && c.fechaFirma <= corte) convertidas++;
    else fallidas++;
  }

  return {
    corte,
    unidades: u,
    superficie: s,
    pctOcupacion: ratio(s.ocupada, s.comercializable),
    pctOcupacionUnidades: ratio(u.ocupados, u.comercializables),
    contratos: {
      vigentes: vig.length,
      porVencer90: vig.filter((c) => dias(c) <= 90).length,
      porVencer180: vig.filter((c) => dias(c) <= 180).length,
      waltMeses: mensual ? suma(vig.map((c) => c.canonMensual * mesesRestantes(c, corte))) / mensual : null,
    },
    renta: {
      mensual,
      porM2: ratio(mensual, s.ocupada),
      enRiesgo90: suma(vig.filter((c) => dias(c) <= 90).map((c) => c.canonMensual)),
    },
    financiero: {
      facturadoMes: suma(emitidas.filter((q) => mesDe(q.fechaEmision) === mesDe(corte)).map((q) => q.importe)),
      facturado12m,
      cobrado12m: suma(pagos.filter((p) => en12(p.fechaPago)).map((p) => p.importe)),
      facturadoTotal: suma(emitidas.map((q) => q.importe)),
      cobradoTotal: suma(pagos.map((p) => p.importe)),
      pendienteCobro: suma(emitidas.map((q) => q.importe)) - suma(pagos.map((p) => p.importe)),
      vencido,
      tasaMorosidad: ratio(vencido, facturado12m),
      tasaCobro12m: ratio(suma(ult12.map((q) => q.pagado)), facturado12m),
      separacionesActivas: separaciones,
    },
    comercial: {
      altas12m,
      renovaciones12m,
      bajas12m: bajas.filter((c) => en12(fechaSalida(c))).length,
      tasaRenovacion: ratio(finalizadosPlazo.filter((c) => renovados.has(c.id)).length, finalizadosPlazo.length),
      tiempoMedioVacioDias: media(vacios),
      conversionReservas: ratio(convertidas, convertidas + fallidas),
      interesados12m: ds.actividades.filter((a) => a.tipo === 'lead' && ctx.localIds.has(a.localId) && en12(a.fecha)).length,
      descuentoMedio: vig.length ? 1 - suma(vig.map((c) => c.valorTotal)) / suma(vig.map((c) => c.valorLista)) : null,
    },
  };
}

// ---------------------------------------------------------------- OCUPACIÓN Y COMERCIAL

export interface FilaSegmento {
  clave: string;
  codigo: string;
  nombre: string;
  planta: string;
  comercializables: number;
  ocupados: number;
  reservados: number;
  disponibles: number;
  areaComercializable: number;
  areaOcupada: number;
  areaReservada: number;
  areaDisponible: number;
  pctOcupacion: number | null;
  rentaMensual: number;
  rentaM2: number | null;
  vencido: number;
  porVencer90: number;
}

export interface AnalisisComercial {
  evolucion: {
    mes: string;
    pctOcupacion: number | null;
    m2Ocupados: number;
    rentaMensual: number;
    altas: number;
    renovaciones: number;
    bajas: number;
    interesados: number;
    reservas: number;
  }[];
  porPlanta: FilaSegmento[];
  porZona: FilaSegmento[];
  porCategoria: {
    categoriaId: number;
    codigo: string;
    nombre: string;
    interesados12m: number;
    contratosVigentes: number;
    m2Ocupados: number;
    rentaMensual: number;
  }[];
  vencimientos: {
    contrato: string;
    localCodigo: string;
    zona: string;
    inquilino: string;
    fechaFin: ISODate;
    diasRestantes: number;
    canonMensual: number;
    vencidoInquilino: number;
  }[];
  calendarioVencimientos: { mes: string; contratos: number; rentaMensual: number }[];
  reservasActivas: {
    codigo: string;
    localCodigo: string;
    zona: string;
    interesado: string;
    fechaReserva: ISODate;
    fechaVencimiento: ISODate;
    diasRestantes: number;
    importeSeparacion: number;
  }[];
  mezcla: { categoriaId: number; nombre: string; m2: number; pct: number }[];
}

function segmento(
  ctx: Contexto,
  clave: string,
  codigo: string,
  nombre: string,
  planta: string,
  ls: Local[],
  vencidoPorLocal: Map<number, number>,
): FilaSegmento {
  const comerc = ls.filter((l) => l.comercializable);
  const by = (e: EstadoComercial) => comerc.filter((l) => ctx.estados.get(l.id)!.estado === e);
  const area = (xs: Local[]) => suma(xs.map((l) => l.areaM2));
  const oc = by('ocupado');
  const renta = suma(oc.map((l) => ctx.estados.get(l.id)!.contrato!.canonMensual));
  return {
    clave,
    codigo,
    nombre,
    planta,
    comercializables: comerc.length,
    ocupados: oc.length,
    reservados: by('reservado').length,
    disponibles: by('disponible').length,
    areaComercializable: area(comerc),
    areaOcupada: area(oc),
    areaReservada: area(by('reservado')),
    areaDisponible: area(by('disponible')),
    pctOcupacion: ratio(area(oc), area(comerc)),
    rentaMensual: renta,
    rentaM2: ratio(renta, area(oc)),
    vencido: suma(ls.map((l) => vencidoPorLocal.get(l.id) ?? 0)),
    porVencer90: oc.filter((l) => ctx.estados.get(l.id)!.contractual === 'por_vencer').length,
  };
}

export function analisisComercial(ctx: Contexto): AnalisisComercial {
  const { ds, corte } = ctx;
  const comercializable = suma(ctx.locales.filter((l) => l.comercializable).map((l) => l.areaM2));
  const delFiltro = ds.contratos.filter((c) => ctx.localIds.has(c.localId));
  const renovados = new Set(delFiltro.filter((c) => c.renovacionDe).map((c) => c.renovacionDe!));

  const evolucion = mesesEntre(ds.meta.fechaApertura, corte).map((mes) => {
    const fin = finDeMes(mes) < corte ? finDeMes(mes) : corte;
    let m2 = 0;
    let renta = 0;
    for (const c of delFiltro) {
      if (contratoVigente(c, fin)) {
        m2 += c.areaM2;
        renta += c.canonMensual;
      }
    }
    const enMes = (f: ISODate) => mesDe(f) === mes && f <= corte;
    return {
      mes,
      pctOcupacion: ratio(m2, comercializable),
      m2Ocupados: m2,
      rentaMensual: renta,
      altas: delFiltro.filter((c) => !c.renovacionDe && enMes(c.fechaInicio)).length,
      renovaciones: delFiltro.filter((c) => c.renovacionDe && enMes(c.fechaInicio)).length,
      bajas: delFiltro.filter((c) => !renovados.has(c.id) && enMes(fechaSalida(c))).length,
      interesados: ds.actividades.filter((a) => a.tipo === 'lead' && ctx.localIds.has(a.localId) && enMes(a.fecha)).length,
      reservas: ds.reservas.filter((r) => ctx.localIds.has(r.localId) && enMes(r.fechaReserva)).length,
    };
  });

  const vencidoPorLocal = new Map<number, number>();
  const contratoPorId = new Map(ds.contratos.map((c) => [c.id, c]));
  for (const q of cuotasConSaldo(ctx)) {
    if (q.fechaVencimiento < corte && q.saldo > 0) {
      const lid = contratoPorId.get(q.contratoId)!.localId;
      vencidoPorLocal.set(lid, (vencidoPorLocal.get(lid) ?? 0) + q.saldo);
    }
  }
  const plantaPorId = new Map(ds.plantas.map((p) => [p.id, p]));
  const porPlanta = ds.plantas
    .filter((p) => ctx.locales.some((l) => l.plantaId === p.id))
    .map((p) => segmento(ctx, `P${p.id}`, p.codigo, p.nombre, p.nombre, ctx.locales.filter((l) => l.plantaId === p.id), vencidoPorLocal));
  const porZona = ds.zonas
    .filter((z) => ctx.locales.some((l) => l.zonaId === z.id))
    .map((z) =>
      segmento(ctx, `Z${z.id}`, z.codigo, z.nombre, plantaPorId.get(z.plantaId)!.nombre, ctx.locales.filter((l) => l.zonaId === z.id), vencidoPorLocal),
    );

  const clientePorId = new Map(ds.clientes.map((c) => [c.id, c]));
  const vig = contratosVigentes(ctx);
  const desde12 = sumarMeses(corte, -12);
  const porCategoria = ds.categorias
    .map((cat) => {
      const cs = vig.filter((c) => c.categoriaId === cat.id);
      return {
        categoriaId: cat.id,
        codigo: cat.codigo,
        nombre: cat.nombre,
        interesados12m: ds.actividades.filter(
          (a) => a.tipo === 'lead' && a.fecha > desde12 && a.fecha <= corte && ctx.localIds.has(a.localId) && clientePorId.get(a.clienteId)!.categoriaId === cat.id,
        ).length,
        contratosVigentes: cs.length,
        m2Ocupados: suma(cs.map((c) => c.areaM2)),
        rentaMensual: suma(cs.map((c) => c.canonMensual)),
      };
    })
    .filter((c) => c.interesados12m + c.contratosVigentes > 0)
    .sort((a, b) => b.rentaMensual - a.rentaMensual);

  const localPorId = new Map(ds.locales.map((l) => [l.id, l]));
  const zonaPorId = new Map(ds.zonas.map((z) => [z.id, z]));
  const vencidoPorContratoCliente = new Map<number, number>();
  for (const q of cuotasConSaldo(ctx)) {
    if (q.fechaVencimiento < corte && q.saldo > 0) {
      const cl = contratoPorId.get(q.contratoId)!.clienteId;
      vencidoPorContratoCliente.set(cl, (vencidoPorContratoCliente.get(cl) ?? 0) + q.saldo);
    }
  }
  const vencimientos = vig
    .map((c) => ({
      contrato: c.codigo,
      localCodigo: localPorId.get(c.localId)!.codigo,
      zona: zonaPorId.get(localPorId.get(c.localId)!.zonaId)!.nombre,
      inquilino: clientePorId.get(c.clienteId)!.nombreComercial,
      fechaFin: c.fechaFin,
      diasRestantes: diasEntre(corte, c.fechaFin),
      canonMensual: c.canonMensual,
      vencidoInquilino: vencidoPorContratoCliente.get(c.clienteId) ?? 0,
    }))
    .sort((a, b) => a.diasRestantes - b.diasRestantes);

  const calendarioVencimientos = mesesEntre(sumarDias(corte, 1), sumarMeses(corte, 12)).map((mes) => {
    const cs = vig.filter((c) => mesDe(c.fechaFin) === mes);
    return { mes, contratos: cs.length, rentaMensual: suma(cs.map((c) => c.canonMensual)) };
  });

  const reservasActivas = ctx.locales
    .map((l) => ctx.estados.get(l.id)!)
    .filter((e) => e.estado === 'reservado')
    .map((e) => {
      const r = e.reserva!;
      const l = localPorId.get(r.localId)!;
      return {
        codigo: r.codigo,
        localCodigo: l.codigo,
        zona: zonaPorId.get(l.zonaId)!.nombre,
        interesado: clientePorId.get(r.clienteId)!.nombreComercial,
        fechaReserva: r.fechaReserva,
        fechaVencimiento: r.fechaVencimiento,
        diasRestantes: diasEntre(corte, r.fechaVencimiento),
        importeSeparacion: r.importeSeparacion,
      };
    })
    .sort((a, b) => a.diasRestantes - b.diasRestantes);

  const m2Total = suma(vig.map((c) => c.areaM2));
  const mezcla = ds.categorias
    .map((cat) => {
      const m2 = suma(vig.filter((c) => c.categoriaId === cat.id).map((c) => c.areaM2));
      return { categoriaId: cat.id, nombre: cat.nombre, m2, pct: m2Total ? m2 / m2Total : 0 };
    })
    .filter((x) => x.m2 > 0)
    .sort((a, b) => b.m2 - a.m2);

  return { evolucion, porPlanta, porZona, porCategoria, vencimientos, calendarioVencimientos, reservasActivas, mezcla };
}

// ---------------------------------------------------------------- FINANCIERO

export interface AnalisisFinanciero {
  mensual: { mes: string; facturado: number; cobrado: number; previsto: number; esFuturo: boolean }[];
  antiguedad: { tramo: string; importe: number; cuotas: number }[];
  deudores: {
    contrato: string;
    estadoContrato: string;
    localCodigo: string;
    inquilino: string;
    vencido: number;
    cuotasVencidas: number;
    diasMaxAtraso: number;
  }[];
  proximosRecibos: { contrato: string; localCodigo: string; inquilino: string; fechaVencimiento: ISODate; saldo: number }[];
}

export function analisisFinanciero(ctx: Contexto): AnalisisFinanciero {
  const { ds, corte } = ctx;
  const cuotas = cuotasConSaldo(ctx);
  const contratoIds = new Set(cuotas.map((q) => q.contratoId));
  const pagos = ds.pagos.filter((p) => contratoIds.has(p.contratoId) && p.fechaPago <= corte);
  const contratoPorId = new Map(ds.contratos.map((c) => [c.id, c]));
  const localPorId = new Map(ds.locales.map((l) => [l.id, l]));
  const clientePorId = new Map(ds.clientes.map((c) => [c.id, c]));
  const mesCorte = mesDe(corte);

  const mensual = mesesEntre(ds.meta.fechaApertura, sumarMeses(corte, 12)).map((mes) => ({
    mes,
    facturado: suma(cuotas.filter((q) => mesDe(q.fechaEmision) === mes && q.fechaEmision <= corte).map((q) => q.importe)),
    cobrado: suma(pagos.filter((p) => mesDe(p.fechaPago) === mes).map((p) => p.importe)),
    previsto: suma(cuotas.filter((q) => mesDe(q.fechaEmision) === mes && q.fechaEmision > corte).map((q) => q.importe)),
    esFuturo: mes > mesCorte,
  }));

  const vencidas = cuotas.filter((q) => q.fechaVencimiento < corte && q.saldo > 0);
  const tramos: [string, number, number][] = [
    ['1–30 días', 1, 30],
    ['31–60 días', 31, 60],
    ['61–90 días', 61, 90],
    ['Más de 90 días', 91, Infinity],
  ];
  const antiguedad = tramos.map(([tramo, a, b]) => {
    const xs = vencidas.filter((q) => {
      const d = diasEntre(q.fechaVencimiento, corte);
      return d >= a && d <= b;
    });
    return { tramo, importe: suma(xs.map((q) => q.saldo)), cuotas: xs.length };
  });

  const porContrato = new Map<number, CuotaConSaldo[]>();
  for (const q of vencidas) porContrato.set(q.contratoId, [...(porContrato.get(q.contratoId) ?? []), q]);
  const deudores = [...porContrato.entries()]
    .map(([id, qs]) => {
      const c = contratoPorId.get(id)!;
      return {
        contrato: c.codigo,
        estadoContrato: contratoVigente(c, corte) ? 'vigente' : c.fechaTerminacion && c.fechaTerminacion <= corte ? 'rescindido' : 'finalizado',
        localCodigo: localPorId.get(c.localId)!.codigo,
        inquilino: clientePorId.get(c.clienteId)!.nombreComercial,
        vencido: suma(qs.map((q) => q.saldo)),
        cuotasVencidas: qs.length,
        diasMaxAtraso: Math.max(...qs.map((q) => diasEntre(q.fechaVencimiento, corte))),
      };
    })
    .sort((a, b) => b.vencido - a.vencido);

  const limite = sumarDias(corte, 30);
  const proximosRecibos = cuotas
    .filter((q) => q.fechaVencimiento >= corte && q.fechaVencimiento <= limite && q.saldo > 0)
    .sort((a, b) => (a.fechaVencimiento < b.fechaVencimiento ? -1 : 1))
    .map((q) => {
      const c = contratoPorId.get(q.contratoId)!;
      return {
        contrato: c.codigo,
        localCodigo: localPorId.get(c.localId)!.codigo,
        inquilino: clientePorId.get(c.clienteId)!.nombreComercial,
        fechaVencimiento: q.fechaVencimiento,
        saldo: q.saldo,
      };
    });

  return { mensual, antiguedad, deudores, proximosRecibos };
}

// ---------------------------------------------------------------- LOCALES

export interface LocalVista {
  id: number;
  codigo: string;
  plantaId: number;
  planta: string;
  zonaId: number;
  zona: string;
  categoriaId: number | null;
  categoria: string | null;
  tipo: Local['tipo'];
  descripcion?: string;
  areaM2: number;
  estado: EstadoComercial;
  estadoContrato: EstadoContractual;
  /** Renta de lista mensual vigente en el corte (indexada). */
  rentaLista: number;
  x: number;
  y: number;
  w: number;
  h: number;
  inquilino: string | null;
  contrato: {
    codigo: string;
    actividad: string;
    fechaInicio: ISODate;
    fechaFin: ISODate;
    diasRestantes: number;
    plazoMeses: number;
    canonMensual: number;
    canonM2: number;
    esRenovacion: boolean;
  } | null;
  reserva: { codigo: string; fechaReserva: ISODate; fechaVencimiento: ISODate; diasRestantes: number; importeSeparacion: number } | null;
  facturado12m: number;
  cobrado12m: number;
  vencido: number;
  interesados12m: number;
  ultimaActividad: ISODate | null;
  /** Días desde que el local quedó libre (null si está ocupado o no se comercializa). */
  diasVacio: number | null;
}

export function localesVista(ctx: Contexto): LocalVista[] {
  const { ds, corte } = ctx;
  const zonaPorId = new Map(ds.zonas.map((z) => [z.id, z]));
  const catPorId = new Map(ds.categorias.map((c) => [c.id, c]));
  const plantaPorId = new Map(ds.plantas.map((p) => [p.id, p]));
  const clientePorId = new Map(ds.clientes.map((c) => [c.id, c]));
  const contratoPorId = new Map(ds.contratos.map((c) => [c.id, c]));
  const desde12 = sumarMeses(corte, -12);
  const fac = new Map<number, number>();
  const cob = new Map<number, number>();
  const ven = new Map<number, number>();
  for (const q of cuotasConSaldo(ctx)) {
    const lid = contratoPorId.get(q.contratoId)!.localId;
    if (q.fechaEmision > desde12 && q.fechaEmision <= corte) {
      fac.set(lid, (fac.get(lid) ?? 0) + q.importe);
      cob.set(lid, (cob.get(lid) ?? 0) + q.pagado);
    }
    if (q.fechaVencimiento < corte && q.saldo > 0) ven.set(lid, (ven.get(lid) ?? 0) + q.saldo);
  }
  const interes = new Map<number, number>();
  const ultima = new Map<number, ISODate>();
  for (const a of ds.actividades) {
    if (a.fecha > corte || !ctx.localIds.has(a.localId)) continue;
    if (a.tipo === 'lead' && a.fecha > desde12) interes.set(a.localId, (interes.get(a.localId) ?? 0) + 1);
    const u = ultima.get(a.localId);
    if (!u || a.fecha > u) ultima.set(a.localId, a.fecha);
  }
  const salidaPorLocal = new Map<number, ISODate>();
  for (const c of ds.contratos) {
    const s = fechaSalida(c);
    if (s <= corte && (!salidaPorLocal.has(c.localId) || s > salidaPorLocal.get(c.localId)!)) salidaPorLocal.set(c.localId, s);
  }

  return ctx.locales.map((l) => {
    const e = ctx.estados.get(l.id)!;
    const c = e.contrato;
    const r = e.reserva;
    const libre = salidaPorLocal.get(l.id) ?? l.fechaLanzamiento;
    return {
      id: l.id,
      codigo: l.codigo,
      plantaId: l.plantaId,
      planta: plantaPorId.get(l.plantaId)!.nombre,
      zonaId: l.zonaId,
      zona: zonaPorId.get(l.zonaId)!.nombre,
      categoriaId: l.categoriaId,
      categoria: l.categoriaId ? catPorId.get(l.categoriaId)!.nombre : null,
      tipo: l.tipo,
      ...(l.descripcion ? { descripcion: l.descripcion } : {}),
      areaM2: l.areaM2,
      estado: e.estado,
      estadoContrato: e.contractual,
      rentaLista: Math.round(l.areaM2 * l.canonM2 * Math.pow(1.05, Math.floor(diasEntre(ds.meta.fechaApertura, corte) / 365))),
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      inquilino: c ? clientePorId.get(c.clienteId)!.nombreComercial : r ? clientePorId.get(r.clienteId)!.nombreComercial : null,
      contrato: c
        ? {
            codigo: c.codigo,
            actividad: catPorId.get(c.categoriaId)!.nombre,
            fechaInicio: c.fechaInicio,
            fechaFin: c.fechaFin,
            diasRestantes: diasEntre(corte, c.fechaFin),
            plazoMeses: c.plazoMeses,
            canonMensual: c.canonMensual,
            canonM2: Math.round(c.canonMensual / c.areaM2),
            esRenovacion: c.renovacionDe !== null,
          }
        : null,
      reserva: r
        ? { codigo: r.codigo, fechaReserva: r.fechaReserva, fechaVencimiento: r.fechaVencimiento, diasRestantes: diasEntre(corte, r.fechaVencimiento), importeSeparacion: r.importeSeparacion }
        : null,
      facturado12m: fac.get(l.id) ?? 0,
      cobrado12m: cob.get(l.id) ?? 0,
      vencido: ven.get(l.id) ?? 0,
      interesados12m: interes.get(l.id) ?? 0,
      ultimaActividad: ultima.get(l.id) ?? null,
      diasVacio: e.estado === 'disponible' || e.estado === 'reservado' ? (libre ? diasEntre(libre, corte) : null) : null,
    };
  });
}

export interface DetalleLocal {
  local: LocalVista;
  contratos: {
    codigo: string;
    inquilino: string;
    fechaInicio: ISODate;
    fechaFin: ISODate;
    fechaTerminacion: ISODate | null;
    canonMensual: number;
    situacion: string;
    esRenovacion: boolean;
  }[];
  reservas: { codigo: string; interesado: string; fechaReserva: ISODate; fechaVencimiento: ISODate; resultado: string }[];
  recibos: { mes: string; importe: number; pagado: number; fechaVencimiento: ISODate; situacion: string }[];
  historial: { fecha: ISODate; tipo: string; cliente: string }[];
}

export function detalleLocal(ctx: Contexto, codigo: string): DetalleLocal | null {
  const local = localesVista(ctx).find((l) => l.codigo === codigo);
  if (!local) return null;
  const { ds, corte } = ctx;
  const clientePorId = new Map(ds.clientes.map((c) => [c.id, c]));
  const delLocal = ds.contratos.filter((c) => c.localId === local.id && c.fechaFirma <= corte);
  const contratos = delLocal
    .map((c) => ({
      codigo: c.codigo,
      inquilino: clientePorId.get(c.clienteId)!.nombreComercial,
      fechaInicio: c.fechaInicio,
      fechaFin: c.fechaFin,
      fechaTerminacion: c.fechaTerminacion && c.fechaTerminacion <= corte ? c.fechaTerminacion : null,
      canonMensual: c.canonMensual,
      situacion: contratoVigente(c, corte)
        ? 'Vigente'
        : c.fechaTerminacion && c.fechaTerminacion <= corte
          ? 'Rescindido'
          : c.fechaInicio > corte
            ? 'Firmado, sin empezar'
            : 'Finalizado',
      esRenovacion: c.renovacionDe !== null,
    }))
    .reverse();
  const contratoPorReserva = new Map(ds.contratos.map((c) => [c.reservaId, c]));
  const reservas = ds.reservas
    .filter((r) => r.localId === local.id && r.fechaReserva <= corte)
    .map((r) => {
      let resultado: string;
      if (reservaActiva(r, corte)) resultado = 'Activa';
      else {
        const c = contratoPorReserva.get(r.id);
        if (c && c.fechaFirma <= corte) resultado = 'Convertida en contrato';
        else if (r.fechaCierre && r.fechaCierre <= r.fechaVencimiento) resultado = 'Cancelada';
        else resultado = 'Vencida';
      }
      return { codigo: r.codigo, interesado: clientePorId.get(r.clienteId)!.nombreComercial, fechaReserva: r.fechaReserva, fechaVencimiento: r.fechaVencimiento, resultado };
    })
    .reverse();
  const ids = new Set(delLocal.map((c) => c.id));
  const desde = sumarMeses(corte, -12);
  const hasta = sumarMeses(corte, 3);
  const recibos = cuotasConSaldo(ctx, ds.contratos.filter((c) => ids.has(c.id)))
    .filter((q) => q.fechaEmision > desde && q.fechaEmision <= hasta)
    .sort((a, b) => (a.fechaEmision < b.fechaEmision ? -1 : 1))
    .map((q) => ({
      mes: mesDe(q.fechaEmision),
      importe: q.importe,
      pagado: q.pagado,
      fechaVencimiento: q.fechaVencimiento,
      situacion: q.saldo <= 0 ? 'Pagado' : q.fechaVencimiento < corte ? (q.pagado > 0 ? 'Vencido (parcial)' : 'Vencido') : q.fechaEmision <= corte ? 'Emitido' : 'Programado',
    }));
  const historial = ds.actividades
    .filter((a) => a.localId === local.id && a.fecha <= corte)
    .map((a) => ({ fecha: a.fecha, tipo: a.tipo, cliente: clientePorId.get(a.clienteId)!.nombreComercial }))
    .reverse()
    .slice(0, 40);
  return { local, contratos, reservas, recibos, historial };
}
