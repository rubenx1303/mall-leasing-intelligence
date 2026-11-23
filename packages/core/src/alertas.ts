import { analisisComercial, analisisFinanciero, crearContexto, contratosVigentes, localesVista, type Contexto } from './kpis.ts';

/**
 * Alertas basadas en reglas explícitas y verificables. Cada alerta incluye la regla y el valor medido.
 */

export interface ReglasAlerta {
  diasContratoPorVencer: number;
  diasReservaPorVencer: number;
  diasVacioProlongado: number;
  /** Zona con % de ocupación < factor × % del centro */
  factorZonaBaja: number;
  minLocalesZona: number;
  umbralConcentracion: number;
  minContratosConcentracion: number;
}

export const REGLAS_POR_DEFECTO: ReglasAlerta = {
  diasContratoPorVencer: 90,
  diasReservaPorVencer: 15,
  diasVacioProlongado: 180,
  factorZonaBaja: 0.85,
  minLocalesZona: 3,
  umbralConcentracion: 0.3,
  minContratosConcentracion: 5,
};

export type Severidad = 'alta' | 'media' | 'baja';
export type TipoAlerta =
  | 'contrato_por_vencer'
  | 'pago_vencido'
  | 'reserva_por_vencer'
  | 'local_vacio_prolongado'
  | 'zona_baja_ocupacion'
  | 'concentracion_categoria';

export interface Alerta {
  id: string;
  tipo: TipoAlerta;
  severidad: Severidad;
  titulo: string;
  detalle: string;
  regla: string;
  entidad: { tipo: 'local' | 'contrato' | 'zona' | 'categoria'; codigo: string };
  valor: number;
}

const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;
const millones = (x: number) => `${(x / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M COP`;

export function alertas(ctx: Contexto, reglas: ReglasAlerta = REGLAS_POR_DEFECTO): Alerta[] {
  const out: Alerta[] = [];
  const com = analisisComercial(ctx);

  // 1. Contratos próximos a vencer (renta en riesgo)
  for (const v of com.vencimientos) {
    if (v.diasRestantes > reglas.diasContratoPorVencer) continue;
    out.push({
      id: `CV-${v.contrato}`,
      tipo: 'contrato_por_vencer',
      severidad: v.diasRestantes <= 30 ? 'alta' : v.diasRestantes <= 60 ? 'media' : 'baja',
      titulo: `${v.contrato} vence en ${v.diasRestantes} días`,
      detalle: `Local ${v.localCodigo} (${v.zona}) · ${v.inquilino} · renta ${millones(v.canonMensual)}/mes · fin ${v.fechaFin}`,
      regla: `Contrato vigente con fin a ${reglas.diasContratoPorVencer} días o menos`,
      entidad: { tipo: 'local', codigo: v.localCodigo },
      valor: v.diasRestantes,
    });
  }

  // 2. Pagos vencidos
  for (const d of analisisFinanciero(ctx).deudores) {
    out.push({
      id: `PV-${d.contrato}`,
      tipo: 'pago_vencido',
      severidad: d.diasMaxAtraso > 60 ? 'alta' : d.diasMaxAtraso > 30 ? 'media' : 'baja',
      titulo: `${d.contrato}: ${millones(d.vencido)} vencidos`,
      detalle: `Local ${d.localCodigo} · ${d.inquilino} · contrato ${d.estadoContrato} · ${d.cuotasVencidas} recibo(s), atraso máximo ${d.diasMaxAtraso} días`,
      regla: 'Recibo con vencimiento anterior al corte y saldo pendiente > 0',
      entidad: { tipo: 'local', codigo: d.localCodigo },
      valor: d.vencido,
    });
  }

  // 3. Reservas por vencer
  for (const r of com.reservasActivas) {
    if (r.diasRestantes > reglas.diasReservaPorVencer) continue;
    out.push({
      id: `RPV-${r.codigo}`,
      tipo: 'reserva_por_vencer',
      severidad: r.diasRestantes <= 5 ? 'alta' : r.diasRestantes <= 10 ? 'media' : 'baja',
      titulo: `Reserva ${r.codigo} vence en ${r.diasRestantes} días`,
      detalle: `Local ${r.localCodigo} (${r.zona}) · ${r.interesado} · vence el ${r.fechaVencimiento}`,
      regla: `Reserva activa con vencimiento a ${reglas.diasReservaPorVencer} días o menos`,
      entidad: { tipo: 'local', codigo: r.localCodigo },
      valor: r.diasRestantes,
    });
  }

  // 4. Locales vacíos durante mucho tiempo
  for (const l of localesVista(ctx)) {
    if (l.estado !== 'disponible' || l.diasVacio === null || l.diasVacio < reglas.diasVacioProlongado) continue;
    out.push({
      id: `VP-${l.codigo}`,
      tipo: 'local_vacio_prolongado',
      severidad: l.tipo === 'ancla' || l.diasVacio >= 365 ? 'alta' : 'media',
      titulo: `Local ${l.codigo} vacío desde hace ${l.diasVacio} días`,
      detalle: `${l.zona} · ${l.areaM2.toLocaleString('es-CO')} m² · renta de lista ${millones(l.rentaLista)}/mes · ${l.interesados12m} interesados en 12 meses`,
      regla: `Disponible y sin contrato desde hace ≥ ${reglas.diasVacioProlongado} días`,
      entidad: { tipo: 'local', codigo: l.codigo },
      valor: l.diasVacio,
    });
  }

  // 5. Zonas con ocupación baja respecto al conjunto del centro
  const global = analisisComercial(crearContexto(ctx.ds, { corte: ctx.corte }));
  const areaG = global.porZona.reduce((s, z) => s + z.areaComercializable, 0);
  const ocupG = global.porZona.reduce((s, z) => s + z.areaOcupada, 0);
  const pctG = areaG ? ocupG / areaG : 0;
  for (const z of com.porZona) {
    if (z.comercializables < reglas.minLocalesZona || z.pctOcupacion === null || z.pctOcupacion >= reglas.factorZonaBaja * pctG) continue;
    out.push({
      id: `ZB-${z.codigo}`,
      tipo: 'zona_baja_ocupacion',
      severidad: z.pctOcupacion < 0.6 * pctG ? 'alta' : 'media',
      titulo: `${z.nombre} (${z.planta}) al ${pct(z.pctOcupacion)} de ocupación`,
      detalle: `Media del centro: ${pct(pctG)} · ${z.disponibles} disponibles de ${z.comercializables}`,
      regla: `% m² ocupados < ${reglas.factorZonaBaja.toLocaleString('es-CO')} × media del centro (zonas con ≥ ${reglas.minLocalesZona} locales)`,
      entidad: { tipo: 'zona', codigo: z.codigo },
      valor: z.pctOcupacion,
    });
  }

  // 6. Concentración de una actividad (sin anclas)
  const anclas = new Set(ctx.ds.categorias.filter((c) => c.grupo === 'Ancla').map((c) => c.id));
  const localPorId = new Map(ctx.ds.locales.map((l) => [l.id, l]));
  const vig = contratosVigentes(ctx).filter((c) => localPorId.get(c.localId)!.tipo !== 'ancla' && !anclas.has(c.categoriaId));
  if (vig.length >= reglas.minContratosConcentracion) {
    const total = vig.reduce((s, c) => s + c.areaM2, 0);
    for (const cat of ctx.ds.categorias) {
      const m2 = vig.filter((c) => c.categoriaId === cat.id).reduce((s, c) => s + c.areaM2, 0);
      const cuota = total ? m2 / total : 0;
      if (cuota <= reglas.umbralConcentracion) continue;
      out.push({
        id: `CC-${cat.codigo}`,
        tipo: 'concentracion_categoria',
        severidad: cuota > 0.4 ? 'alta' : 'media',
        titulo: `${cat.nombre} ocupa el ${pct(cuota)} de la superficie alquilada`,
        detalle: `${m2.toLocaleString('es-CO')} m² de ${total.toLocaleString('es-CO')} m² alquilados (sin anclas)`,
        regla: `Cuota de una actividad > ${pct(reglas.umbralConcentracion)} de los m² alquilados (sin anclas)`,
        entidad: { tipo: 'categoria', codigo: cat.codigo },
        valor: cuota,
      });
    }
  }

  const orden: Record<Severidad, number> = { alta: 0, media: 1, baja: 2 };
  return out.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
}
