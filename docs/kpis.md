# Definición de indicadores (modelo v2: centro en explotación)

Todos los indicadores se calculan **a una fecha de corte** a partir de las fechas de los hechos (inicio y fin de
contrato, emisión y vencimiento de recibos, pagos, reservas), no de estados guardados. Por eso se puede consultar
cualquier mes pasado. Implementación de referencia: `packages/core/src/kpis.ts`. Réplica en SQL sobre Oro:
`pipeline/gold.sql` (`gold.v_kpi_calculado`), comparada automáticamente en `control.v_validacion_kpi`.

## Estado de un local en la fecha de corte *d*

| Estado | Regla |
|---|---|
| No comercializable | `comercializable = false` (cuartos técnicos, administración) |
| Ocupado | Contrato con `fecha_inicio ≤ d ≤ fecha_fin` y sin rescisión anterior o igual a *d* |
| Reservado | Reserva activa (`fecha_reserva ≤ d ≤ fecha_vencimiento` y sin cierre anterior o igual a *d*) |
| Disponible | Ninguno de los anteriores |

**Una reserva no es ocupación.** Estado del contrato (filtro): *vence en ≤ 90 días* si un contrato vigente termina
en 90 días o menos; *vigente* el resto de ocupados; *sin contrato* el resto.

## Ocupación y contratos

| Indicador | Fórmula |
|---|---|
| % ocupación | m² ocupados ÷ m² comercializables (también por número de locales) |
| Renta mensual | Σ renta mensual de los contratos vigentes |
| Renta por m² | renta mensual ÷ m² ocupados |
| Contratos por vencer | vigentes con fin a ≤ 90 (y ≤ 180) días; «renta en riesgo» = su renta mensual |
| WALT | Σ (renta × meses restantes) ÷ Σ renta, de los vigentes |
| Altas / renovaciones / bajas (12 m) | contratos nuevos, renovaciones y salidas sin renovación en los últimos 12 meses |
| Tasa de renovación | renovados ÷ contratos terminados por fin de plazo |
| Tiempo medio vacío | días entre que un local queda libre y empieza el siguiente contrato |
| Conversión de reservas | reservas convertidas ÷ reservas cerradas |

## Ingresos y cobros

| Indicador | Fórmula |
|---|---|
| Facturado | Σ recibos con `fecha_emision ≤ d` (también en el mes y en los últimos 12 meses) |
| Cobrado | Σ pagos con `fecha_pago ≤ d` (total y últimos 12 meses) |
| Pendiente de cobro | facturado − cobrado |
| Vencido | Σ max(0, importe − pagado) de recibos con `fecha_vencimiento < d` (incluye antiguos inquilinos) |
| Tasa de morosidad | vencido ÷ facturado de los últimos 12 meses |
| Tasa de cobro (12 m) | lo pagado de los recibos emitidos en 12 meses ÷ su importe |

Invariantes comprobados: cobrado ≤ facturado; vencido ≤ pendiente; plantas y zonas suman el total; la evolución
mensual termina en los valores actuales; Σ recibos de un contrato no rescindido = su valor.

Para no duplicar importes, cada importe se suma a su granularidad natural: renta en el **contrato**, facturación en
el **recibo**, cobro en el **pago**.

## Alertas (reglas por defecto en `REGLAS_POR_DEFECTO`)

| Alerta | Regla |
|---|---|
| Contrato por vencer | Vigente con fin a ≤ 90 días (alta ≤ 30, media ≤ 60) |
| Pago vencido | Recibos vencidos con saldo > 0 (alta si el atraso > 60 días) |
| Reserva por vencer | Reserva activa que vence en ≤ 15 días |
| Local vacío prolongado | Disponible desde hace ≥ 180 días |
| Zona con baja ocupación | % ocupación < 0,85 × media del centro (zonas con ≥ 3 locales) |
| Concentración de actividad | Una actividad > 30 % de los m² alquilados (sin anclas) |
