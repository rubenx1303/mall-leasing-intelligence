/* =====================================================================================
   Vistas de KPI en GOLD a la fecha de corte de la carga, y validación frente a
   control.kpi_esperado (cargado con 90_esperados.sql, generado desde packages/core).
   ESTADO: escrito y revisado, NO ejecutado todavía en Fabric.
   ===================================================================================== */
CREATE OR ALTER VIEW gold.v_corte AS
SELECT MAX(fecha_sk) AS corte_sk,
       CAST(CAST(MAX(fecha_sk) AS CHAR(8)) AS DATE) AS corte
FROM gold.FactEstadoLocalMensual;
GO

-- Cuotas de contratos firmados a la fecha de corte, con lo pagado hasta esa fecha
CREATE OR ALTER VIEW gold.v_cuota_saldo AS
WITH k AS (SELECT corte_sk FROM gold.v_corte),
pagado AS (
    SELECT p.cuota_id, SUM(p.importe) AS pagado
    FROM gold.FactPagos p CROSS JOIN k WHERE p.fecha_pago_sk <= k.corte_sk
    GROUP BY p.cuota_id
)
SELECT q.*, COALESCE(pg.pagado, 0) AS pagado, q.importe - COALESCE(pg.pagado, 0) AS saldo,
       CASE WHEN q.fecha_emision_sk <= k.corte_sk THEN 1 ELSE 0 END AS emitida,
       CASE WHEN q.fecha_vencimiento_sk < k.corte_sk THEN 1 ELSE 0 END AS vencida
FROM gold.FactCuotas q
JOIN gold.FactContratos c ON c.contrato_id = q.contrato_id
CROSS JOIN k
LEFT JOIN pagado pg ON pg.cuota_id = q.cuota_id
WHERE c.estado_contrato = 'vigente' AND c.fecha_firma_sk <= k.corte_sk;
GO

-- KPIs por ámbito (global, planta y zona) en formato largo, comparable con control.kpi_esperado
CREATE OR ALTER VIEW gold.v_kpi_calculado AS
WITH k AS (SELECT corte_sk FROM gold.v_corte),
est AS (
    SELECT e.*, d.cuenta_como_venta, d.estado_codigo, z.planta_codigo, z.zona_codigo
    FROM gold.FactEstadoLocalMensual e
    JOIN gold.DimEstadoComercial d ON d.estado_sk = e.estado_sk
    JOIN gold.DimZona z ON z.zona_sk = e.zona_sk
    CROSS JOIN k WHERE e.fecha_sk = k.corte_sk
),
ctr AS (
    SELECT c.*, z.planta_codigo, z.zona_codigo
    FROM gold.FactContratos c JOIN gold.DimZona z ON z.zona_sk = c.zona_sk CROSS JOIN k
    WHERE c.estado_contrato = 'vigente' AND c.fecha_firma_sk <= k.corte_sk
),
cuo AS (SELECT s.*, z.planta_codigo FROM gold.v_cuota_saldo s JOIN gold.DimZona z ON z.zona_sk = s.zona_sk),
glob AS (
    SELECT CAST('global' AS VARCHAR(20)) AS ambito, CAST('' AS VARCHAR(20)) AS clave, v.kpi, v.valor FROM (VALUES
      ('locales_total',            (SELECT CAST(COUNT(*) AS DECIMAL(38,10)) FROM est)),
      ('locales_comercializables', (SELECT CAST(COUNT(*) AS DECIMAL(38,10)) FROM est WHERE estado_codigo <> 'no_comercializable')),
      ('locales_disponibles',      (SELECT CAST(COUNT(*) AS DECIMAL(38,10)) FROM est WHERE estado_codigo = 'disponible')),
      ('locales_reservados',       (SELECT CAST(COUNT(*) AS DECIMAL(38,10)) FROM est WHERE estado_codigo = 'reservado')),
      ('locales_firmados',         (SELECT CAST(COUNT(*) AS DECIMAL(38,10)) FROM est WHERE cuenta_como_venta = 1)),
      ('m2_comercializables',      (SELECT CAST(SUM(area_m2) AS DECIMAL(38,10)) FROM est WHERE estado_codigo <> 'no_comercializable')),
      ('m2_firmados',              (SELECT CAST(SUM(area_m2) AS DECIMAL(38,10)) FROM est WHERE cuenta_como_venta = 1)),
      ('m2_reservados',            (SELECT CAST(SUM(area_m2) AS DECIMAL(38,10)) FROM est WHERE estado_codigo = 'reservado')),
      ('pct_comercializacion',     (SELECT CAST(SUM(CASE WHEN cuenta_como_venta = 1 THEN area_m2 ELSE 0 END) AS DECIMAL(38,10))
                                           / NULLIF(SUM(CASE WHEN estado_codigo <> 'no_comercializable' THEN area_m2 ELSE 0 END), 0) FROM est)),
      ('valor_contratado',         (SELECT CAST(SUM(valor_total) AS DECIMAL(38,10)) FROM ctr)),
      ('facturado',                (SELECT CAST(SUM(importe) AS DECIMAL(38,10)) FROM cuo WHERE emitida = 1)),
      ('cobrado',                  (SELECT CAST(SUM(pagado) AS DECIMAL(38,10)) FROM cuo)),
      ('vencido',                  (SELECT CAST(SUM(CASE WHEN saldo > 0 THEN saldo ELSE 0 END) AS DECIMAL(38,10)) FROM cuo WHERE vencida = 1)),
      ('tiempo_medio_hasta_firma_dias',      (SELECT AVG(CAST(dias_hasta_firma AS DECIMAL(38,10))) FROM ctr)),
      ('tiempo_medio_comercializacion_dias', (SELECT AVG(CAST(dias_comercializacion AS DECIMAL(38,10))) FROM ctr))
    ) v(kpi, valor)
),
planta AS (
    SELECT CAST('planta' AS VARCHAR(20)) AS ambito, CAST(p.planta_codigo AS VARCHAR(20)) AS clave, v.kpi, v.valor
    FROM (SELECT DISTINCT planta_codigo FROM est) p
    CROSS APPLY (VALUES
      ('locales_firmados', (SELECT CAST(COUNT(*) AS DECIMAL(38,10)) FROM est e WHERE e.planta_codigo = p.planta_codigo AND e.cuenta_como_venta = 1)),
      ('m2_firmados',      (SELECT CAST(COALESCE(SUM(area_m2), 0) AS DECIMAL(38,10)) FROM est e WHERE e.planta_codigo = p.planta_codigo AND e.cuenta_como_venta = 1)),
      ('valor_contratado', (SELECT CAST(COALESCE(SUM(valor_total), 0) AS DECIMAL(38,10)) FROM ctr c WHERE c.planta_codigo = p.planta_codigo)),
      ('cobrado',          (SELECT CAST(COALESCE(SUM(pagado), 0) AS DECIMAL(38,10)) FROM cuo q WHERE q.planta_codigo = p.planta_codigo))
    ) v(kpi, valor)
),
zona AS (
    SELECT CAST('zona' AS VARCHAR(20)) AS ambito, CAST(z.zona_codigo AS VARCHAR(20)) AS clave, v.kpi, v.valor
    FROM (SELECT DISTINCT zona_codigo FROM est) z
    CROSS APPLY (VALUES
      ('locales_firmados', (SELECT CAST(COUNT(*) AS DECIMAL(38,10)) FROM est e WHERE e.zona_codigo = z.zona_codigo AND e.cuenta_como_venta = 1)),
      ('m2_firmados',      (SELECT CAST(COALESCE(SUM(area_m2), 0) AS DECIMAL(38,10)) FROM est e WHERE e.zona_codigo = z.zona_codigo AND e.cuenta_como_venta = 1)),
      ('valor_contratado', (SELECT CAST(COALESCE(SUM(valor_total), 0) AS DECIMAL(38,10)) FROM ctr c WHERE c.zona_codigo = z.zona_codigo))
    ) v(kpi, valor)
)
SELECT * FROM glob UNION ALL SELECT * FROM planta UNION ALL SELECT * FROM zona;
GO

-- Resultado de la validación: debe devolver 0 filas con resultado = 'FALLO'
CREATE OR ALTER VIEW control.v_validacion_kpi AS
SELECT e.ambito, e.clave, e.kpi, e.valor AS esperado, c.valor AS calculado,
       ABS(COALESCE(c.valor, 0) - e.valor) AS diferencia,
       CASE WHEN c.valor IS NULL THEN 'FALLO'
            WHEN ABS(c.valor - e.valor) <= CASE WHEN e.kpi LIKE 'pct%' OR e.kpi LIKE 'tiempo%' THEN 0.000001
                                                 WHEN e.kpi LIKE 'm2%' THEN 0.01 ELSE 0 END THEN 'OK'
            ELSE 'FALLO' END AS resultado
FROM control.kpi_esperado e
LEFT JOIN gold.v_kpi_calculado c ON c.ambito = e.ambito AND c.clave = e.clave AND c.kpi = e.kpi;
GO
