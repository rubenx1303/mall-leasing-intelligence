-- =====================================================================================
-- GOLD (local, PostgreSQL): modelo en estrella construido a partir de SILVER.
-- Mismo diseño que fabric/warehouse (T-SQL), adaptado a PostgreSQL y al modelo v2
-- (centro comercial FICTICIO en explotación). Recarga completa e idempotente.
-- =====================================================================================
DROP SCHEMA IF EXISTS gold CASCADE;
CREATE SCHEMA gold;
CREATE SCHEMA IF NOT EXISTS control;

-- ----------------------------------------------------------------- parámetros
CREATE TABLE gold.parametros AS SELECT clave, valor FROM silver.parametros;

-- ----------------------------------------------------------------- DIMENSIONES
CREATE TABLE gold.dim_fecha AS
SELECT (EXTRACT(YEAR FROM d) * 10000 + EXTRACT(MONTH FROM d) * 100 + EXTRACT(DAY FROM d))::int AS fecha_sk,
       d::date                                   AS fecha,
       EXTRACT(YEAR FROM d)::smallint            AS anio,
       EXTRACT(QUARTER FROM d)::smallint         AS trimestre,
       EXTRACT(MONTH FROM d)::smallint           AS mes,
       to_char(d, 'YYYY-MM')                     AS anio_mes,
       EXTRACT(ISODOW FROM d)::smallint          AS dia_semana,
       (d = (date_trunc('month', d) + interval '1 month - 1 day'))::boolean AS es_fin_mes
FROM generate_series('2023-01-01'::date, '2035-12-31'::date, interval '1 day') AS g(d);
ALTER TABLE gold.dim_fecha ADD PRIMARY KEY (fecha_sk);
INSERT INTO gold.dim_fecha VALUES (-1, '1900-01-01', 1900, 1, 1, '1900-01', 1, false);

CREATE TABLE gold.dim_planta AS SELECT id AS planta_sk, codigo, nombre, nivel, ancho, alto FROM silver.planta;
ALTER TABLE gold.dim_planta ADD PRIMARY KEY (planta_sk);

CREATE TABLE gold.dim_zona AS
SELECT z.id AS zona_sk, z.codigo, z.nombre, z.tipo, z.planta_id AS planta_sk, p.codigo AS planta_codigo, p.nombre AS planta_nombre
FROM silver.zona z JOIN silver.planta p ON p.id = z.planta_id;
INSERT INTO gold.dim_zona VALUES (-1, '?', 'Desconocida', '?', 1, '?', 'Desconocida');
ALTER TABLE gold.dim_zona ADD PRIMARY KEY (zona_sk);

CREATE TABLE gold.dim_categoria AS SELECT id AS categoria_sk, codigo, nombre, grupo FROM silver.categoria;
INSERT INTO gold.dim_categoria VALUES (-1, '?', 'Sin categoría', 'Sin categoría');
ALTER TABLE gold.dim_categoria ADD PRIMARY KEY (categoria_sk);

CREATE TABLE gold.dim_local AS
SELECT l.id AS local_sk, l.codigo, l.planta_id AS planta_sk, l.zona_id AS zona_sk, COALESCE(l.categoria_id, -1) AS categoria_uso_sk,
       l.tipo AS tipo_local, l.comercializable, l.area_m2, l.canon_m2, l.fecha_lanzamiento, l.descripcion,
       l.x, l.y, l.w, l.h, z.nombre AS zona_nombre, p.nombre AS planta_nombre
FROM silver.local l JOIN silver.zona z ON z.id = l.zona_id JOIN silver.planta p ON p.id = l.planta_id;
ALTER TABLE gold.dim_local ADD PRIMARY KEY (local_sk);

-- Inquilinos e interesados: sin datos personales (código, marca ficticia y actividad)
CREATE TABLE gold.dim_cliente AS
SELECT id AS cliente_sk, codigo, nombre_comercial, categoria_id AS categoria_sk, tipo_persona, canal, fecha_alta FROM silver.cliente;
ALTER TABLE gold.dim_cliente ADD PRIMARY KEY (cliente_sk);

CREATE TABLE gold.dim_estado_comercial (
  estado_sk smallint PRIMARY KEY, codigo text NOT NULL, nombre text NOT NULL, orden smallint NOT NULL,
  comercializable boolean NOT NULL, cuenta_como_ocupado boolean NOT NULL
);
INSERT INTO gold.dim_estado_comercial VALUES
  (1, 'ocupado', 'Ocupado (contrato vigente)', 1, true, true),
  (2, 'reservado', 'Reservado', 2, true, false),
  (3, 'disponible', 'Disponible', 3, true, false),
  (4, 'no_comercializable', 'No comercializable', 4, false, false);

CREATE TABLE gold.ref_elemento_plano AS
SELECT id AS orden, planta_id AS planta_sk, tipo, etiqueta, x, y, w, h FROM silver.elemento_plano;

-- ----------------------------------------------------------------- HECHOS
-- Una fila por contrato de arrendamiento
CREATE TABLE gold.fact_contrato AS
SELECT c.id AS contrato_id, c.codigo, c.local_id AS local_sk, l.zona_id AS zona_sk, l.planta_id AS planta_sk,
       c.cliente_id AS cliente_sk, c.categoria_id AS categoria_actividad_sk, c.reserva_id, c.renovacion_de,
       c.fecha_firma, c.fecha_inicio, c.fecha_fin, c.fecha_terminacion,
       to_char(c.fecha_inicio, 'YYYYMMDD')::int AS fecha_inicio_sk,
       to_char(c.fecha_fin, 'YYYYMMDD')::int    AS fecha_fin_sk,
       c.plazo_meses, c.area_m2, c.canon_mensual, c.valor_total, c.valor_lista, c.estado,
       (c.renovacion_de IS NOT NULL) AS es_renovacion
FROM silver.contrato c JOIN silver.local l ON l.id = c.local_id;
ALTER TABLE gold.fact_contrato ADD PRIMARY KEY (contrato_id);

-- Una fila por recibo mensual de renta (facturación)
CREATE TABLE gold.fact_recibo AS
SELECT q.id AS recibo_id, q.contrato_id, c.local_id AS local_sk, l.zona_id AS zona_sk, l.planta_id AS planta_sk, q.numero,
       q.fecha_emision, q.fecha_vencimiento,
       to_char(q.fecha_emision, 'YYYYMMDD')::int AS fecha_emision_sk,
       to_char(q.fecha_vencimiento, 'YYYYMMDD')::int AS fecha_vencimiento_sk,
       q.importe
FROM silver.cuota q JOIN silver.contrato c ON c.id = q.contrato_id JOIN silver.local l ON l.id = c.local_id;
ALTER TABLE gold.fact_recibo ADD PRIMARY KEY (recibo_id);

-- Una fila por pago recibido (cobro)
CREATE TABLE gold.fact_pago AS
SELECT p.id AS pago_id, p.cuota_id AS recibo_id, p.contrato_id, c.local_id AS local_sk, l.zona_id AS zona_sk, l.planta_id AS planta_sk,
       p.fecha_pago, to_char(p.fecha_pago, 'YYYYMMDD')::int AS fecha_pago_sk, p.importe, p.medio
FROM silver.pago p JOIN silver.contrato c ON c.id = p.contrato_id JOIN silver.local l ON l.id = c.local_id;
ALTER TABLE gold.fact_pago ADD PRIMARY KEY (pago_id);

-- Una fila por reserva
CREATE TABLE gold.fact_reserva AS
SELECT r.id AS reserva_id, r.codigo, r.local_id AS local_sk, l.zona_id AS zona_sk, r.cliente_id AS cliente_sk,
       r.fecha_reserva, r.fecha_vencimiento, r.fecha_cierre, r.estado, r.importe_separacion
FROM silver.reserva r JOIN silver.local l ON l.id = r.local_id;
ALTER TABLE gold.fact_reserva ADD PRIMARY KEY (reserva_id);

-- Una fila por evento comercial
CREATE TABLE gold.fact_actividad AS
SELECT a.id AS actividad_id, a.local_id AS local_sk, l.zona_id AS zona_sk, a.cliente_id AS cliente_sk,
       a.fecha, to_char(a.fecha, 'YYYYMMDD')::int AS fecha_sk, a.tipo, a.canal
FROM silver.actividad a JOIN silver.local l ON l.id = a.local_id;
ALTER TABLE gold.fact_actividad ADD PRIMARY KEY (actividad_id);

-- Instantánea periódica: estado de cada local al cierre de cada mes (y en la fecha de corte)
CREATE TABLE gold.fact_ocupacion_mensual AS
WITH p AS (
  SELECT (SELECT valor::date FROM silver.parametros WHERE clave = 'fecha_corte')    AS corte,
         (SELECT valor::date FROM silver.parametros WHERE clave = 'fecha_apertura') AS apertura
),
cortes AS (
  SELECT f.fecha FROM gold.dim_fecha f, p WHERE f.es_fin_mes AND f.fecha >= p.apertura AND f.fecha < p.corte
  UNION SELECT corte FROM p
),
vig AS (
  SELECT k.fecha, c.local_id, c.id AS contrato_id, c.canon_mensual
  FROM cortes k JOIN silver.contrato c
    ON c.fecha_inicio <= k.fecha AND k.fecha <= c.fecha_fin AND (c.fecha_terminacion IS NULL OR k.fecha < c.fecha_terminacion)
)
SELECT to_char(k.fecha, 'YYYYMMDD')::int AS fecha_sk, k.fecha, l.id AS local_sk, l.zona_id AS zona_sk, l.planta_id AS planta_sk,
       COALESCE(l.categoria_id, -1) AS categoria_uso_sk, l.area_m2,
       CASE
         WHEN NOT l.comercializable THEN 4
         WHEN v.contrato_id IS NOT NULL THEN 1
         WHEN EXISTS (SELECT 1 FROM silver.reserva r
                      WHERE r.local_id = l.id AND r.fecha_reserva <= k.fecha AND k.fecha <= r.fecha_vencimiento
                        AND (r.fecha_cierre IS NULL OR k.fecha < r.fecha_cierre)) THEN 2
         ELSE 3
       END::smallint AS estado_sk,
       v.contrato_id, COALESCE(v.canon_mensual, 0) AS canon_mensual
FROM cortes k CROSS JOIN silver.local l
LEFT JOIN vig v ON v.fecha = k.fecha AND v.local_id = l.id;
ALTER TABLE gold.fact_ocupacion_mensual ADD PRIMARY KEY (fecha_sk, local_sk);

-- ----------------------------------------------------------------- MODELO ANALÍTICO (SQL)
CREATE VIEW gold.v_corte AS
SELECT (SELECT valor::date FROM gold.parametros WHERE clave = 'fecha_corte') AS corte;

-- Recibos con lo pagado hasta el corte
CREATE VIEW gold.v_recibo_saldo AS
SELECT r.*, COALESCE(pg.pagado, 0) AS pagado, r.importe - COALESCE(pg.pagado, 0) AS saldo,
       r.fecha_emision <= k.corte AS emitido, r.fecha_vencimiento < k.corte AS vencido
FROM gold.fact_recibo r CROSS JOIN gold.v_corte k
LEFT JOIN (SELECT p.recibo_id, SUM(p.importe) AS pagado FROM gold.fact_pago p, gold.v_corte k WHERE p.fecha_pago <= k.corte GROUP BY p.recibo_id) pg
  ON pg.recibo_id = r.recibo_id;

-- Ocupación y renta por mes (serie de la evolución)
CREATE VIEW gold.v_ocupacion_mes AS
SELECT to_char(o.fecha, 'YYYY-MM') AS mes, o.fecha,
       SUM(o.area_m2) FILTER (WHERE e.cuenta_como_ocupado) AS m2_ocupados,
       SUM(o.area_m2) FILTER (WHERE e.comercializable) AS m2_comercializables,
       SUM(o.area_m2) FILTER (WHERE e.cuenta_como_ocupado)::numeric / NULLIF(SUM(o.area_m2) FILTER (WHERE e.comercializable), 0) AS pct_ocupacion,
       SUM(o.canon_mensual) AS renta_mensual,
       COUNT(*) FILTER (WHERE e.cuenta_como_ocupado) AS locales_ocupados
FROM gold.fact_ocupacion_mensual o JOIN gold.dim_estado_comercial e ON e.estado_sk = o.estado_sk
GROUP BY o.fecha;

-- KPIs en formato largo (ámbito, clave, kpi, valor), comparables con control.kpi_esperado
CREATE VIEW gold.v_kpi_calculado AS
WITH k AS (SELECT corte FROM gold.v_corte),
est AS (
  SELECT o.*, e.codigo AS estado, e.cuenta_como_ocupado, e.comercializable, z.codigo AS zona_codigo, pl.codigo AS planta_codigo
  FROM gold.fact_ocupacion_mensual o
  JOIN gold.dim_estado_comercial e ON e.estado_sk = o.estado_sk
  JOIN gold.dim_zona z ON z.zona_sk = o.zona_sk
  JOIN gold.dim_planta pl ON pl.planta_sk = o.planta_sk
  CROSS JOIN k WHERE o.fecha = k.corte
),
vig AS (
  SELECT c.* FROM gold.fact_contrato c CROSS JOIN k
  WHERE c.fecha_inicio <= k.corte AND k.corte <= c.fecha_fin AND (c.fecha_terminacion IS NULL OR k.corte < c.fecha_terminacion)
),
rec AS (SELECT s.*, pl.codigo AS planta_codigo FROM gold.v_recibo_saldo s JOIN gold.dim_planta pl ON pl.planta_sk = s.planta_sk),
pag AS (SELECT p.* FROM gold.fact_pago p CROSS JOIN k WHERE p.fecha_pago <= k.corte)
SELECT 'global'::text AS ambito, ''::text AS clave, x.kpi, x.valor::numeric FROM (
  SELECT 'locales_total' AS kpi, (SELECT COUNT(*) FROM est)::numeric AS valor
  UNION ALL SELECT 'locales_comercializables', (SELECT COUNT(*) FROM est WHERE comercializable)
  UNION ALL SELECT 'locales_ocupados', (SELECT COUNT(*) FROM est WHERE estado = 'ocupado')
  UNION ALL SELECT 'locales_reservados', (SELECT COUNT(*) FROM est WHERE estado = 'reservado')
  UNION ALL SELECT 'locales_disponibles', (SELECT COUNT(*) FROM est WHERE estado = 'disponible')
  UNION ALL SELECT 'm2_comercializables', (SELECT SUM(area_m2) FROM est WHERE comercializable)
  UNION ALL SELECT 'm2_ocupados', (SELECT COALESCE(SUM(area_m2), 0) FROM est WHERE cuenta_como_ocupado)
  UNION ALL SELECT 'pct_ocupacion', (SELECT SUM(area_m2) FILTER (WHERE cuenta_como_ocupado)::numeric / NULLIF(SUM(area_m2) FILTER (WHERE comercializable), 0) FROM est)
  UNION ALL SELECT 'renta_mensual', (SELECT COALESCE(SUM(canon_mensual), 0) FROM vig)
  UNION ALL SELECT 'contratos_vigentes', (SELECT COUNT(*) FROM vig)
  UNION ALL SELECT 'contratos_por_vencer_90', (SELECT COUNT(*) FROM vig, k WHERE vig.fecha_fin - k.corte <= 90)
  UNION ALL SELECT 'facturado_total', (SELECT COALESCE(SUM(importe), 0) FROM rec WHERE emitido)
  UNION ALL SELECT 'facturado_12m', (SELECT COALESCE(SUM(importe), 0) FROM rec, k WHERE emitido AND fecha_emision > (k.corte - interval '12 months')::date)
  UNION ALL SELECT 'cobrado_total', (SELECT COALESCE(SUM(importe), 0) FROM pag)
  UNION ALL SELECT 'vencido', (SELECT COALESCE(SUM(GREATEST(saldo, 0)), 0) FROM rec WHERE vencido)
  UNION ALL SELECT 'tasa_morosidad', (SELECT (SELECT COALESCE(SUM(GREATEST(saldo, 0)), 0) FROM rec WHERE vencido)::numeric
                                           / NULLIF((SELECT SUM(importe) FROM rec, k WHERE emitido AND fecha_emision > (k.corte - interval '12 months')::date), 0))
) x
UNION ALL
SELECT 'planta', pl.codigo, y.kpi, y.valor FROM gold.dim_planta pl
CROSS JOIN LATERAL (
  SELECT 'locales_ocupados' AS kpi, (SELECT COUNT(*) FROM est WHERE planta_codigo = pl.codigo AND estado = 'ocupado')::numeric AS valor
  UNION ALL SELECT 'm2_ocupados', (SELECT COALESCE(SUM(area_m2), 0) FROM est WHERE planta_codigo = pl.codigo AND cuenta_como_ocupado)
  UNION ALL SELECT 'renta_mensual', (SELECT COALESCE(SUM(canon_mensual), 0) FROM vig WHERE planta_sk = pl.planta_sk)
  UNION ALL SELECT 'vencido', (SELECT COALESCE(SUM(GREATEST(saldo, 0)), 0) FROM rec WHERE vencido AND planta_codigo = pl.codigo)
) y
UNION ALL
SELECT 'zona', z.codigo, w.kpi, w.valor FROM gold.dim_zona z
CROSS JOIN LATERAL (
  SELECT 'locales_ocupados' AS kpi, (SELECT COUNT(*) FROM est WHERE zona_codigo = z.codigo AND estado = 'ocupado')::numeric AS valor
  UNION ALL SELECT 'm2_ocupados', (SELECT COALESCE(SUM(area_m2), 0) FROM est WHERE zona_codigo = z.codigo AND cuenta_como_ocupado)
  UNION ALL SELECT 'renta_mensual', (SELECT COALESCE(SUM(canon_mensual), 0) FROM vig WHERE zona_sk = z.zona_sk)
) w WHERE z.zona_sk > 0
UNION ALL
SELECT 'mes', m.mes, v.kpi, v.valor FROM gold.v_ocupacion_mes m
CROSS JOIN LATERAL (VALUES ('pct_ocupacion', m.pct_ocupacion), ('renta_mensual', m.renta_mensual::numeric)) v(kpi, valor);

-- ----------------------------------------------------------------- CONTROL
CREATE TABLE IF NOT EXISTS control.kpi_esperado (ambito text, clave text, kpi text, valor numeric);
CREATE TABLE IF NOT EXISTS control.ejecucion_pipeline (
  ejecutado_en timestamptz NOT NULL DEFAULT now(), lote text NOT NULL, segundos numeric NOT NULL,
  kpis_ok int NOT NULL, kpis_fallo int NOT NULL, filas_cuarentena int NOT NULL, detalle jsonb NOT NULL
);

CREATE OR REPLACE VIEW control.v_validacion_kpi AS
SELECT e.ambito, e.clave, e.kpi, e.valor AS esperado, c.valor AS calculado, ABS(COALESCE(c.valor, 0) - e.valor) AS diferencia,
       CASE WHEN c.valor IS NULL THEN 'FALLO'
            WHEN ABS(c.valor - e.valor) <= CASE WHEN e.kpi LIKE 'pct%' OR e.kpi LIKE 'tasa%' THEN 1e-9 WHEN e.kpi LIKE 'm2%' THEN 0.005 ELSE 0 END THEN 'OK'
            ELSE 'FALLO' END AS resultado
FROM control.kpi_esperado e
LEFT JOIN gold.v_kpi_calculado c ON c.ambito = e.ambito AND c.clave = e.clave AND c.kpi = e.kpi;
