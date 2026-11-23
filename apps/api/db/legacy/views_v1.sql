-- LEGADO (modelo v1 de preventa). Ya no se ejecuta: los KPI en SQL viven ahora en la capa Gold (pipeline/gold.sql).
-- Vistas de control en SQL. Reproducen en PostgreSQL los indicadores principales para
-- contrastarlos con la implementación de referencia (packages/core). La prueba de integración
-- comprueba que ambas dan exactamente el mismo resultado.
SET search_path = comercial;

CREATE OR REPLACE VIEW v_parametros AS
SELECT
  (SELECT valor::date FROM parametros WHERE clave = 'fecha_corte') AS fecha_corte;

-- Estado comercial de cada local a la fecha de corte (una reserva no es una venta).
CREATE OR REPLACE VIEW v_estado_local AS
SELECT
  l.id,
  l.codigo,
  l.planta_id,
  l.zona_id,
  l.categoria_id,
  l.area_m2,
  CASE
    WHEN NOT l.comercializable THEN 'no_comercializable'
    WHEN EXISTS (
      SELECT 1 FROM contrato c
      WHERE c.local_id = l.id AND c.estado = 'vigente' AND c.fecha_firma <= p.fecha_corte
    ) THEN 'contrato_firmado'
    WHEN EXISTS (
      SELECT 1 FROM reserva r
      WHERE r.local_id = l.id
        AND r.fecha_reserva <= p.fecha_corte
        AND p.fecha_corte <= r.fecha_vencimiento
        AND (r.fecha_cierre IS NULL OR p.fecha_corte < r.fecha_cierre)
    ) THEN 'reservado'
    ELSE 'disponible'
  END AS estado
FROM local l
CROSS JOIN v_parametros p;

-- Cuotas de contratos vigentes con lo pagado hasta el corte.
CREATE OR REPLACE VIEW v_cuota_saldo AS
WITH pagado AS (
  SELECT pg.cuota_id, SUM(pg.importe) AS pagado
  FROM pago pg CROSS JOIN v_parametros p
  WHERE pg.fecha_pago <= p.fecha_corte
  GROUP BY pg.cuota_id
)
SELECT
  q.*,
  COALESCE(pa.pagado, 0) AS pagado,
  q.importe - COALESCE(pa.pagado, 0) AS saldo,
  q.fecha_emision <= p.fecha_corte AS emitida,
  q.fecha_vencimiento < p.fecha_corte AS vencida
FROM cuota q
JOIN contrato c ON c.id = q.contrato_id
CROSS JOIN v_parametros p
LEFT JOIN pagado pa ON pa.cuota_id = q.id
WHERE c.estado = 'vigente' AND c.fecha_firma <= p.fecha_corte;

CREATE OR REPLACE VIEW v_kpi_resumen AS
SELECT
  (SELECT COUNT(*) FROM v_estado_local)                                                  AS locales_total,
  (SELECT COUNT(*) FROM v_estado_local WHERE estado <> 'no_comercializable')            AS locales_comercializables,
  (SELECT COUNT(*) FROM v_estado_local WHERE estado = 'disponible')                     AS locales_disponibles,
  (SELECT COUNT(*) FROM v_estado_local WHERE estado = 'reservado')                      AS locales_reservados,
  (SELECT COUNT(*) FROM v_estado_local WHERE estado = 'contrato_firmado')               AS locales_firmados,
  (SELECT COALESCE(SUM(area_m2), 0) FROM v_estado_local WHERE estado <> 'no_comercializable') AS m2_comercializables,
  (SELECT COALESCE(SUM(area_m2), 0) FROM v_estado_local WHERE estado = 'contrato_firmado')    AS m2_firmados,
  (SELECT COALESCE(SUM(area_m2), 0) FROM v_estado_local WHERE estado = 'reservado')           AS m2_reservados,
  (SELECT COALESCE(SUM(c.valor_total), 0) FROM contrato c CROSS JOIN v_parametros p
     WHERE c.estado = 'vigente' AND c.fecha_firma <= p.fecha_corte)                       AS valor_contratado,
  (SELECT COALESCE(SUM(importe), 0) FROM v_cuota_saldo WHERE emitida)                    AS facturado,
  (SELECT COALESCE(SUM(pagado), 0) FROM v_cuota_saldo)                                   AS cobrado,
  (SELECT COALESCE(SUM(GREATEST(saldo, 0)), 0) FROM v_cuota_saldo WHERE vencida)         AS vencido;
