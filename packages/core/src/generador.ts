import { construirPlano, CATEGORIAS, RENTA_BASE_M2 } from './plano.ts';
import { Rng } from './rng.ts';
import { diasEntre, sumarDias, sumarMeses } from './fechas.ts';
import type {
  Actividad,
  Canal,
  Cliente,
  Contrato,
  Cuota,
  Dataset,
  ISODate,
  Local,
  Pago,
  Reserva,
  TipoActividad,
} from './types.ts';

/**
 * Generador del conjunto de datos FICTICIO: un centro comercial inventado que abrió el
 * 1-abr-2024 y está en explotación. Cada local comercializable tiene una historia de
 * contratos de arrendamiento (con renovaciones, bajas y rescisiones por impago), periodos
 * vacíos con interesados y reservas, recibos mensuales de renta y pagos con distintos
 * comportamientos (puntual, tardío, moroso, parcial).
 *
 * Garantías (las verifican las pruebas):
 *  - Contratos de un mismo local sin solaparse; como máximo uno vigente en cada fecha.
 *  - Reservas de un mismo local sin solaparse.
 *  - Una reserva convertida se cierra el día de la firma, dentro de su vigencia.
 *  - Σ recibos de un contrato no rescindido = valor total; Σ pagos de un recibo ≤ su importe.
 *  - Pagos posteriores a la emisión del recibo y no posteriores al corte.
 */

export interface OpcionesGenerador {
  semilla?: number;
  fechaCorte?: ISODate;
}

export const FECHA_APERTURA = '2024-04-01';
export const FECHA_CORTE = '2026-11-20';
export const NOMBRE_CENTRO = 'Centro Comercial Arboleda (ficticio)';

interface Comportamiento {
  ocupacionApertura: number;
  renovacion: number;
  vacioMeses: [number, number];
  interesadosPorMes: number;
}

/** Comportamiento de mercado por zona (ficticio, para crear escenarios contrastados). */
const MERCADO: Record<string, Comportamiento> = {
  'P1-PC': { ocupacionApertura: 0.85, renovacion: 0.7, vacioMeses: [2, 6], interesadosPorMes: 1.4 },
  'P1-BC': { ocupacionApertura: 0.65, renovacion: 0.55, vacioMeses: [3, 10], interesadosPorMes: 1.0 },
  'P1-GN': { ocupacionApertura: 0.75, renovacion: 0.6, vacioMeses: [2, 8], interesadosPorMes: 1.2 },
  'P1-GS': { ocupacionApertura: 0.65, renovacion: 0.5, vacioMeses: [3, 12], interesadosPorMes: 0.8 },
  'P2-GN': { ocupacionApertura: 0.5, renovacion: 0.45, vacioMeses: [4, 16], interesadosPorMes: 0.6 },
  'P2-IS': { ocupacionApertura: 0.6, renovacion: 0.5, vacioMeses: [3, 10], interesadosPorMes: 0.8 },
  'P2-FC': { ocupacionApertura: 0.45, renovacion: 0.35, vacioMeses: [5, 20], interesadosPorMes: 0.5 },
};

/** Anclas: renta por m² y plazo (meses) del contrato inicial. */
const ANCLAS: Record<string, { canonM2: number; plazo: number }> = {
  'P1-AO-01': { canonM2: 42_000, plazo: 120 },
  'P1-AE-01': { canonM2: 38_000, plazo: 120 },
  'P2-AE-01': { canonM2: 32_000, plazo: 120 },
  // El ancla de ocio de la planta 2 no renovó al terminar su primer contrato: queda vacía (escenario de demo)
  'P2-AO-01': { canonM2: 30_000, plazo: 24 },
};

const SILABAS = ['al', 'be', 'ca', 'do', 'el', 'fa', 'ga', 'lu', 'ma', 'ne', 'or', 'pa', 'ri', 'so', 'ta', 'va', 'ze', 'mi', 'no', 'ki'];
const SUFIJO: Record<string, string> = {
  SUP: 'Market', TDP: 'Almacenes', MOD: 'Moda', CAL: 'Pasos', RES: 'Cocina', CAF: 'Café', SAB: 'Bienestar',
  TEC: 'Tech', HOG: 'Casa', SER: 'Servicios', ENT: 'Ocio', DPT: 'Sport', INF: 'Kids',
};
const CANALES: [Canal, number][] = [
  ['web', 30], ['whatsapp', 25], ['referido', 15], ['broker', 12], ['visita_sala', 12], ['feria', 6],
];

type Perfil = 'puntual' | 'tardio' | 'moroso' | 'parcial';

export function generarDataset(opciones: OpcionesGenerador = {}): Dataset {
  const semilla = opciones.semilla ?? 14;
  const corte = opciones.fechaCorte ?? FECHA_CORTE;
  const rng = new Rng(semilla);
  const plano = construirPlano();
  const zonaCodigo = new Map(plano.zonas.map((z) => [z.id, z.codigo]));

  const locales: Local[] = plano.locales.map((l) => {
    let canon = 0;
    if (l.comercializable) {
      if (l.tipo === 'ancla') canon = ANCLAS[l.codigo]?.canonM2 ?? 35_000;
      else {
        const base = RENTA_BASE_M2[zonaCodigo.get(l.zonaId)!] ?? 100_000;
        canon = Math.round((base * (1 + (rng.next() - 0.5) * 0.16)) / 1000) * 1000;
      }
    }
    return { ...l, canonM2: canon, fechaLanzamiento: l.comercializable ? FECHA_APERTURA : null };
  });

  const clientes: Cliente[] = [];
  const actividades: Actividad[] = [];
  const reservas: Reserva[] = [];
  const contratos: Contrato[] = [];
  const cuotas: Cuota[] = [];
  const pagos: Pago[] = [];
  const nombres = new Set<string>();

  const nuevoCliente = (categoriaId: number, fechaAlta: ISODate): Cliente => {
    const cod = CATEGORIAS.find((c) => c.id === categoriaId)!.codigo;
    let nombre = '';
    do {
      const raiz = rng.pick(SILABAS) + rng.pick(SILABAS) + (rng.bool(0.5) ? rng.pick(SILABAS) : '');
      nombre = `${raiz[0].toUpperCase()}${raiz.slice(1)} ${SUFIJO[cod]}`;
    } while (nombres.has(nombre));
    nombres.add(nombre);
    const c: Cliente = {
      id: clientes.length + 1,
      codigo: `CLI-${String(clientes.length + 1).padStart(4, '0')}`,
      nombreComercial: nombre,
      categoriaId,
      tipoPersona: rng.bool(0.85) ? 'juridica' : 'natural',
      canal: rng.weighted(CANALES),
      fechaAlta,
    };
    clientes.push(c);
    return c;
  };

  const actividad = (cl: Cliente, l: Local, tipo: TipoActividad, fecha: ISODate) =>
    actividades.push({ id: actividades.length + 1, clienteId: cl.id, localId: l.id, tipo, fecha, canal: cl.canal });

  const categoriaInteresado = (l: Local): number => {
    if (l.categoriaId && rng.bool(0.7)) return l.categoriaId;
    return rng.pick(CATEGORIAS.filter((c) => c.grupo !== 'Ancla')).id;
  };

  const nuevaReserva = (l: Local, cl: Cliente, fecha: ISODate, estado: Reserva['estado'], cierre: ISODate | null): Reserva => {
    const r: Reserva = {
      id: reservas.length + 1,
      codigo: `RES-${String(reservas.length + 1).padStart(4, '0')}`,
      localId: l.id,
      clienteId: cl.id,
      fechaReserva: fecha,
      fechaVencimiento: sumarDias(fecha, 30),
      fechaCierre: cierre,
      estado,
      importeSeparacion: l.tipo === 'ancla' ? 60_000_000 : rng.pick([3, 5, 8, 10]) * 1_000_000,
    };
    reservas.push(r);
    actividad(cl, l, 'reserva', fecha);
    return r;
  };

  /** Interesados que no llegan a reservar dentro de [desde, hasta]. */
  const interesados = (l: Local, desde: ISODate, hasta: ISODate, porMes: number) => {
    const dias = diasEntre(desde, hasta);
    if (dias < 5) return;
    const n = Math.round((dias / 30) * porMes * (0.5 + rng.next()));
    for (let i = 0; i < n; i++) {
      const f = sumarDias(desde, rng.int(0, dias - 1));
      const cl = nuevoCliente(categoriaInteresado(l), f);
      actividad(cl, l, 'lead', f);
      let ultima = f;
      if (rng.bool(0.5)) {
        const v = sumarDias(f, rng.int(2, 15));
        if (v <= hasta) {
          actividad(cl, l, 'visita', v);
          ultima = v;
          if (rng.bool(0.4)) {
            const p = sumarDias(v, rng.int(3, 15));
            if (p <= hasta) {
              actividad(cl, l, 'propuesta', p);
              ultima = p;
            }
          }
        }
      }
      if (rng.bool(0.5)) {
        const d = sumarDias(ultima, rng.int(7, 30));
        if (d <= hasta) actividad(cl, l, 'desistimiento', d);
      }
    }
  };

  /** Embudo de un interesado que acaba reservando: lead → visita → propuesta → reserva. */
  const embudo = (cl: Cliente, l: Local, lead: ISODate, reserva: ISODate) => {
    const d = Math.max(0, diasEntre(lead, reserva));
    actividad(cl, l, 'lead', lead);
    actividad(cl, l, 'visita', sumarDias(lead, Math.floor(d * 0.35)));
    actividad(cl, l, 'propuesta', sumarDias(lead, Math.floor(d * 0.75)));
  };

  const perfilPago = (): Perfil =>
    rng.weighted<Perfil>([['puntual', 72], ['tardio', 17], ['moroso', 6], ['parcial', 5]]);

  /**
   * Crea un contrato con sus recibos y pagos. Devuelve la fecha en que deja el local
   * (día siguiente al fin o a la rescisión) o null si sigue vigente después del corte.
   */
  const crearContrato = (
    l: Local,
    cl: Cliente,
    inicio: ISODate,
    firma: ISODate,
    plazo: number,
    canonM2: number,
    reservaId: number | null,
    renovacionDe: number | null,
    perfil: Perfil,
  ): { contrato: Contrato; libreDesde: ISODate | null } => {
    const descuento = l.tipo === 'ancla' ? 0 : rng.int(0, 10) / 100;
    const listaMensual = Math.round(l.areaM2 * canonM2);
    const canon = Math.round((listaMensual * (1 - descuento)) / 1000) * 1000;
    const fin = sumarDias(sumarMeses(inicio, plazo), -1);
    const dejaDePagar = rng.int(2, 7);
    let terminacion: ISODate | null = null;
    if (perfil === 'moroso' && l.tipo !== 'ancla') {
      // Tras 3-5 recibos impagados se rescinde el contrato (si ocurre antes del fin y del corte)
      const t = sumarMeses(inicio, dejaDePagar + rng.int(3, 5));
      if (t < fin && t <= corte) terminacion = t;
    } else if (l.tipo !== 'ancla' && plazo > 8 && rng.bool(0.18)) {
      // Salida anticipada pactada (cierre del negocio), al corriente de pago
      const t = sumarMeses(inicio, rng.int(6, plazo - 2));
      if (t < fin && t <= corte) terminacion = t;
    }
    const c: Contrato = {
      id: contratos.length + 1,
      codigo: `CTR-${String(contratos.length + 1).padStart(4, '0')}`,
      localId: l.id,
      clienteId: cl.id,
      reservaId,
      renovacionDe,
      tipo: 'arriendo',
      categoriaId: cl.categoriaId,
      fechaFirma: firma,
      fechaInicio: inicio,
      fechaFin: fin,
      fechaTerminacion: terminacion,
      plazoMeses: plazo,
      areaM2: l.areaM2,
      canonMensual: canon,
      valorTotal: canon * plazo,
      valorLista: listaMensual * plazo,
      estado: terminacion ? 'rescindido' : fin < corte ? 'finalizado' : 'vigente',
    };
    contratos.push(c);
    actividad(cl, l, renovacionDe ? 'renovacion' : 'contrato', firma);

    const medio = rng.weighted<Pago['medio']>([['transferencia', 55], ['pse', 25], ['consignacion', 15], ['cheque', 5]]);
    for (let k = 0; k < plazo; k++) {
      const emision = sumarMeses(inicio, k);
      if (terminacion && emision >= terminacion) break;
      const q: Cuota = {
        id: cuotas.length + 1,
        contratoId: c.id,
        numero: k + 1,
        concepto: 'canon',
        fechaEmision: emision,
        fechaVencimiento: sumarDias(emision, 9),
        importe: canon,
      };
      cuotas.push(q);
      if (emision > corte) continue;
      const aTiempo = () => sumarDias(q.fechaEmision, rng.int(1, 9));
      let fecha: ISODate | null = null;
      let importe = q.importe;
      if (perfil === 'puntual') fecha = aTiempo();
      else if (perfil === 'tardio') fecha = rng.bool(0.45) ? aTiempo() : sumarDias(q.fechaVencimiento, rng.int(3, 45));
      else if (perfil === 'moroso') fecha = k < dejaDePagar ? aTiempo() : null;
      else {
        fecha = aTiempo();
        importe = Math.round((q.importe * rng.pick([0.8, 0.85, 0.9, 0.95])) / 1000) * 1000;
      }
      if (fecha && fecha <= corte) {
        pagos.push({ id: pagos.length + 1, cuotaId: q.id, contratoId: c.id, fechaPago: fecha, importe, medio });
      }
    }
    const sale = terminacion ?? sumarDias(fin, 1);
    return { contrato: c, libreDesde: sale <= corte ? sale : null };
  };

  /** Factor de indexación anual (5 %) de la renta de lista desde la apertura. */
  const indexar = (canonM2: number, fecha: ISODate) =>
    Math.round((canonM2 * Math.pow(1.05, Math.floor(diasEntre(FECHA_APERTURA, fecha) / 365))) / 1000) * 1000;

  const plazoNormal = () =>
    rng.weighted<number>([[12, 14], [18, 10], [24, 18], [30, 10], [32, 8], [33, 8], [34, 8], [36, 14], [48, 6], [60, 4]]);

  for (const l of locales) {
    if (!l.comercializable) continue;
    const zc = zonaCodigo.get(l.zonaId)!;
    const m = MERCADO[zc] ?? { ocupacionApertura: 0.7, renovacion: 0.6, vacioMeses: [2, 6] as [number, number], interesadosPorMes: 0.8 };

    // ---------------------------------------------------------------- anclas
    if (l.tipo === 'ancla') {
      const a = ANCLAS[l.codigo];
      const firma = sumarDias(FECHA_APERTURA, -rng.int(150, 300));
      const cl = nuevoCliente(l.categoriaId!, sumarDias(firma, -60));
      embudo(cl, l, sumarDias(firma, -60), sumarDias(firma, -20));
      const r = nuevaReserva(l, cl, sumarDias(firma, -20), 'convertida', firma);
      const { libreDesde } = crearContrato(l, cl, FECHA_APERTURA, firma, a.plazo, a.canonM2, r.id, null, 'puntual');
      if (libreDesde) {
        // Ancla vacía: interesados y una reserva en negociación en la fecha de corte
        interesados(l, libreDesde, corte, 0.6);
        const fr = sumarDias(corte, -18);
        const nuevo = nuevoCliente(l.categoriaId!, sumarDias(fr, -40));
        embudo(nuevo, l, sumarDias(fr, -40), fr);
        nuevaReserva(l, nuevo, fr, 'activa', null);
      }
      continue;
    }

    // ---------------------------------------------------------------- locales
    let libreDesde: ISODate | null = null; // null = ocupado
    let inquilino: Cliente | null = null;
    let contratoPrevio: Contrato | null = null;
    let perfil: Perfil = 'puntual';

    if (rng.bool(m.ocupacionApertura)) {
      const firma = sumarDias(FECHA_APERTURA, -rng.int(20, 120));
      inquilino = nuevoCliente(rng.bool(0.85) ? l.categoriaId! : categoriaInteresado(l), sumarDias(firma, -45));
      const fr = sumarDias(firma, -rng.int(7, 25));
      embudo(inquilino, l, sumarDias(fr, -rng.int(15, 45)), fr);
      const r = nuevaReserva(l, inquilino, fr, 'convertida', firma);
      perfil = perfilPago();
      // Los primeros inquilinos abren de forma escalonada durante los dos primeros meses
      const inicio = sumarDias(FECHA_APERTURA, rng.bool(0.6) ? 0 : rng.int(1, 60));
      const res = crearContrato(l, inquilino, inicio, firma, plazoNormal(), l.canonM2, r.id, null, perfil);
      contratoPrevio = res.contrato;
      libreDesde = res.libreDesde;
      if (!libreDesde) continue;
    } else {
      libreDesde = FECHA_APERTURA;
    }

    // Bucle de la historia del local hasta el corte
    for (let guarda = 0; guarda < 12 && libreDesde; guarda++) {
      // ¿Renovación del mismo inquilino al terminar el plazo? (no tras rescisión ni con deudas)
      if (contratoPrevio && inquilino && contratoPrevio.estado === 'finalizado' && perfil !== 'moroso' && rng.bool(m.renovacion)) {
        const inicio = libreDesde;
        const firma = sumarDias(contratoPrevio.fechaFin, -rng.int(15, 60));
        const res = crearContrato(l, inquilino, inicio, firma, plazoNormal(), indexar(l.canonM2, inicio), null, contratoPrevio.id, perfil);
        contratoPrevio = res.contrato;
        libreDesde = res.libreDesde;
        continue;
      }

      // Periodo vacío
      const finVacio = sumarDias(sumarMeses(libreDesde, rng.int(m.vacioMeses[0], m.vacioMeses[1])), rng.int(0, 20));
      const hastaInteres = finVacio < corte ? finVacio : corte;
      interesados(l, libreDesde, hastaInteres, m.interesadosPorMes);

      // Reserva fallida durante el vacío (vencida o cancelada)
      const hueco = diasEntre(libreDesde, hastaInteres);
      if (hueco > 75 && rng.bool(0.3)) {
        const r0 = sumarDias(libreDesde, rng.int(5, hueco - 70));
        const cl = nuevoCliente(categoriaInteresado(l), sumarDias(r0, -20));
        embudo(cl, l, sumarDias(r0, -20), r0);
        if (rng.bool(0.55)) nuevaReserva(l, cl, r0, 'vencida', sumarDias(r0, 31));
        else {
          const cierre = sumarDias(r0, rng.int(5, 25));
          nuevaReserva(l, cl, r0, 'cancelada', cierre);
          actividad(cl, l, 'desistimiento', cierre);
        }
      }

      if (finVacio > corte) {
        // Sigue vacío en el corte; a veces con una reserva activa
        if (diasEntre(corte, finVacio) <= 40 && rng.bool(0.6)) {
          const fr = sumarDias(corte, -rng.int(2, 26));
          if (fr > sumarDias(libreDesde, 3)) {
            const cl = nuevoCliente(categoriaInteresado(l), sumarDias(fr, -25));
            embudo(cl, l, sumarDias(fr, -25) < libreDesde ? libreDesde : sumarDias(fr, -25), fr);
            nuevaReserva(l, cl, fr, 'activa', null);
          }
        }
        break;
      }

      // Nuevo inquilino: reserva convertida y contrato
      inquilino = nuevoCliente(rng.bool(0.8) ? l.categoriaId! : categoriaInteresado(l), finVacio);
      const firma = finVacio;
      let fr = sumarDias(firma, -rng.int(7, 25));
      if (fr <= libreDesde) fr = sumarDias(libreDesde, 1);
      const lead = sumarDias(fr, -rng.int(10, 40));
      embudo(inquilino, l, lead < libreDesde ? libreDesde : lead, fr);
      const r = nuevaReserva(l, inquilino, fr, 'convertida', firma);
      perfil = perfilPago();
      const res = crearContrato(l, inquilino, firma, firma, plazoNormal(), indexar(l.canonM2, firma), r.id, null, perfil);
      contratoPrevio = res.contrato;
      libreDesde = res.libreDesde;
    }
  }

  return {
    meta: {
      nombre: 'Mall Intelligence — conjunto de demostración',
      centro: NOMBRE_CENTRO,
      version: '2.0.0',
      ficticio: true,
      semilla,
      moneda: 'COP',
      fechaCorte: corte,
      fechaApertura: FECHA_APERTURA,
      aviso:
        'Datos FICTICIOS generados para demostración. El centro comercial, sus inquilinos, contratos, rentas y plano son inventados.',
    },
    plantas: plano.plantas,
    zonas: plano.zonas,
    categorias: CATEGORIAS,
    locales,
    elementos: plano.elementos,
    clientes,
    actividades: actividades
      .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id))
      .map((a, i) => ({ ...a, id: i + 1 })),
    reservas,
    contratos,
    cuotas,
    pagos,
  };
}
