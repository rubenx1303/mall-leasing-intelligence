/* =====================================================================================
   Carga completa de GOLD desde las tablas Silver del Lakehouse «LH_Mall» (mismo área de
   trabajo; consulta entre bases de datos por su punto de conexión SQL).
   Recarga total e idempotente: el volumen es pequeño. Con volumen real, pasar a carga
   incremental por fecha de modificación (MERGE).
   ESTADO: escrito y revisado, NO ejecutado todavía en Fabric.
   ===================================================================================== */
CREATE OR ALTER PROCEDURE gold.usp_cargar_gold
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @corte  DATE = (SELECT CAST(valor AS DATE) FROM LH_Mall.dbo.silver_parametros WHERE clave = 'fecha_corte');
    DECLARE @inicio DATE = (SELECT CAST(valor AS DATE) FROM LH_Mall.dbo.silver_parametros WHERE clave = 'inicio_comercializacion');
    DECLARE @ahora  DATETIME2(6) = SYSUTCDATETIME();

    IF @corte IS NULL THROW 50001, 'Silver sin fecha de corte: ejecutar antes el notebook Bronze → Silver', 1;

    /* ---------------- DimFecha: 2025-01-01 … 2037-12-31 (cubre cánones de arriendo a 10 años) */
    TRUNCATE TABLE gold.DimFecha;
    WITH d AS (SELECT n FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) v(n)),
         numeros AS (SELECT a.n + 10*b.n + 100*c.n + 1000*e.n AS n FROM d a CROSS JOIN d b CROSS JOIN d c CROSS JOIN d e),
         dias AS (SELECT DATEADD(DAY, n, CAST('2025-01-01' AS DATE)) AS fecha FROM numeros
                  WHERE DATEADD(DAY, n, CAST('2025-01-01' AS DATE)) <= '2037-12-31')
    INSERT INTO gold.DimFecha
    SELECT  YEAR(fecha) * 10000 + MONTH(fecha) * 100 + DAY(fecha),
            fecha,
            YEAR(fecha),
            DATEPART(QUARTER, fecha),
            MONTH(fecha),
            CASE MONTH(fecha) WHEN 1 THEN 'enero' WHEN 2 THEN 'febrero' WHEN 3 THEN 'marzo' WHEN 4 THEN 'abril'
                 WHEN 5 THEN 'mayo' WHEN 6 THEN 'junio' WHEN 7 THEN 'julio' WHEN 8 THEN 'agosto'
                 WHEN 9 THEN 'septiembre' WHEN 10 THEN 'octubre' WHEN 11 THEN 'noviembre' ELSE 'diciembre' END,
            CONVERT(CHAR(7), fecha, 126),
            (DATEPART(WEEKDAY, fecha) + @@DATEFIRST - 2) % 7 + 1,
            CASE WHEN fecha = EOMONTH(fecha) THEN 1 ELSE 0 END
    FROM dias;
    INSERT INTO gold.DimFecha VALUES (-1, '1900-01-01', 1900, 1, 1, 'desconocido', '1900-01', 1, 0);

    /* ---------------- Dimensiones de negocio */
    TRUNCATE TABLE gold.DimZona;
    INSERT INTO gold.DimZona
    SELECT z.id, z.codigo, z.nombre, z.tipo, p.codigo, p.nombre, p.nivel
    FROM LH_Mall.dbo.silver_zona z JOIN LH_Mall.dbo.silver_planta p ON p.id = z.planta_id;
    INSERT INTO gold.DimZona VALUES (-1, '?', 'Desconocida', '?', '?', 'Desconocida', 0);

    TRUNCATE TABLE gold.DimCategoria;
    INSERT INTO gold.DimCategoria SELECT id, codigo, nombre, grupo FROM LH_Mall.dbo.silver_categoria;
    INSERT INTO gold.DimCategoria VALUES (-1, '?', 'Sin categoría', 'Sin categoría');

    TRUNCATE TABLE gold.DimLocal;
    INSERT INTO gold.DimLocal
    SELECT l.id, l.codigo, l.tipo, l.comercializable, l.area_m2, l.precio_lista_m2, l.canon_m2, l.fecha_lanzamiento,
           l.zona_id, COALESCE(l.categoria_id, -1), p.codigo, z.nombre, l.descripcion
    FROM LH_Mall.dbo.silver_local l
    JOIN LH_Mall.dbo.silver_zona z   ON z.id = l.zona_id
    JOIN LH_Mall.dbo.silver_planta p ON p.id = l.planta_id;
    INSERT INTO gold.DimLocal VALUES (-1, '?', '?', 0, 0, 0, 0, NULL, -1, -1, '?', 'Desconocida', NULL);

    TRUNCATE TABLE gold.DimEstadoComercial;
    INSERT INTO gold.DimEstadoComercial VALUES
        (1, 'contrato_firmado',   'Contrato firmado',   1, 1, 1),
        (2, 'reservado',          'Reservado',          2, 1, 0),
        (3, 'disponible',         'Disponible',         3, 1, 0),
        (4, 'no_comercializable', 'No comercializable', 4, 0, 0);

    /* ---------------- FactContratos */
    TRUNCATE TABLE gold.FactContratos;
    WITH primer_contacto AS (
        SELECT cliente_id, local_id, MIN(fecha) AS fecha
        FROM LH_Mall.dbo.silver_actividad GROUP BY cliente_id, local_id
    )
    INSERT INTO gold.FactContratos
    SELECT c.id, c.codigo, c.tipo, c.estado, cl.codigo, c.local_id, l.zona_id, c.categoria_id,
           CONVERT(INT, CONVERT(CHAR(8), c.fecha_firma, 112)),
           c.area_m2, c.valor_total, c.valor_lista, c.plazo_meses,
           DATEDIFF(DAY, COALESCE(pc.fecha, c.fecha_firma), c.fecha_firma),
           DATEDIFF(DAY, l.fecha_lanzamiento, c.fecha_firma)
    FROM LH_Mall.dbo.silver_contrato c
    JOIN LH_Mall.dbo.silver_local l    ON l.id = c.local_id
    JOIN LH_Mall.dbo.silver_cliente cl ON cl.id = c.cliente_id
    LEFT JOIN primer_contacto pc       ON pc.cliente_id = c.cliente_id AND pc.local_id = c.local_id;

    /* ---------------- FactCuotas y FactPagos */
    TRUNCATE TABLE gold.FactCuotas;
    INSERT INTO gold.FactCuotas
    SELECT q.id, q.contrato_id, c.local_id, l.zona_id, q.numero, q.concepto,
           CONVERT(INT, CONVERT(CHAR(8), q.fecha_emision, 112)), CONVERT(INT, CONVERT(CHAR(8), q.fecha_vencimiento, 112)), q.importe
    FROM LH_Mall.dbo.silver_cuota q
    JOIN LH_Mall.dbo.silver_contrato c ON c.id = q.contrato_id
    JOIN LH_Mall.dbo.silver_local l    ON l.id = c.local_id;

    TRUNCATE TABLE gold.FactPagos;
    INSERT INTO gold.FactPagos
    SELECT pg.id, pg.cuota_id, pg.contrato_id, c.local_id, l.zona_id,
           CONVERT(INT, CONVERT(CHAR(8), pg.fecha_pago, 112)), CONVERT(INT, CONVERT(CHAR(8), q.fecha_vencimiento, 112)),
           pg.importe, pg.medio
    FROM LH_Mall.dbo.silver_pago pg
    JOIN LH_Mall.dbo.silver_cuota q    ON q.id = pg.cuota_id AND q.contrato_id = pg.contrato_id
    JOIN LH_Mall.dbo.silver_contrato c ON c.id = pg.contrato_id
    JOIN LH_Mall.dbo.silver_local l    ON l.id = c.local_id;

    /* ---------------- FactReservas */
    TRUNCATE TABLE gold.FactReservas;
    INSERT INTO gold.FactReservas
    SELECT r.id, r.codigo, cl.codigo, r.local_id, l.zona_id, cl.categoria_id,
           CONVERT(INT, CONVERT(CHAR(8), r.fecha_reserva, 112)),
           CONVERT(INT, CONVERT(CHAR(8), r.fecha_vencimiento, 112)),
           COALESCE(CONVERT(INT, CONVERT(CHAR(8), r.fecha_cierre, 112)), -1),
           CASE
             WHEN EXISTS (SELECT 1 FROM LH_Mall.dbo.silver_contrato c WHERE c.reserva_id = r.id AND c.fecha_firma <= @corte) THEN 'convertida'
             WHEN r.fecha_reserva <= @corte AND @corte <= r.fecha_vencimiento AND (r.fecha_cierre IS NULL OR @corte < r.fecha_cierre) THEN 'activa'
             WHEN r.fecha_cierre IS NOT NULL AND r.fecha_cierre <= r.fecha_vencimiento THEN 'cancelada'
             ELSE 'vencida'
           END,
           r.importe_separacion
    FROM LH_Mall.dbo.silver_reserva r
    JOIN LH_Mall.dbo.silver_local l    ON l.id = r.local_id
    JOIN LH_Mall.dbo.silver_cliente cl ON cl.id = r.cliente_id;

    /* ---------------- FactActividadComercial */
    TRUNCATE TABLE gold.FactActividadComercial;
    INSERT INTO gold.FactActividadComercial
    SELECT a.id, cl.codigo, a.local_id, l.zona_id, cl.categoria_id, CONVERT(INT, CONVERT(CHAR(8), a.fecha, 112)), a.tipo, a.canal
    FROM LH_Mall.dbo.silver_actividad a
    JOIN LH_Mall.dbo.silver_local l    ON l.id = a.local_id
    JOIN LH_Mall.dbo.silver_cliente cl ON cl.id = a.cliente_id;

    /* ---------------- FactEstadoLocalMensual: cierres de mes desde el inicio + fecha de corte */
    TRUNCATE TABLE gold.FactEstadoLocalMensual;
    WITH cortes AS (
        SELECT fecha FROM gold.DimFecha WHERE es_fin_mes = 1 AND fecha >= @inicio AND fecha < @corte
        UNION SELECT @corte
    ),
    estado AS (
        SELECT k.fecha, l.id AS local_id, l.zona_id, COALESCE(l.categoria_id, -1) AS categoria_uso_sk, l.area_m2,
               CASE
                 WHEN l.comercializable = 0 THEN 4
                 WHEN EXISTS (SELECT 1 FROM LH_Mall.dbo.silver_contrato c
                              WHERE c.local_id = l.id AND c.estado = 'vigente' AND c.fecha_firma <= k.fecha) THEN 1
                 WHEN EXISTS (SELECT 1 FROM LH_Mall.dbo.silver_reserva r
                              WHERE r.local_id = l.id AND r.fecha_reserva <= k.fecha AND k.fecha <= r.fecha_vencimiento
                                AND (r.fecha_cierre IS NULL OR k.fecha < r.fecha_cierre)) THEN 2
                 ELSE 3
               END AS estado_sk
        FROM cortes k CROSS JOIN LH_Mall.dbo.silver_local l
    )
    INSERT INTO gold.FactEstadoLocalMensual
    SELECT CONVERT(INT, CONVERT(CHAR(8), fecha, 112)), local_id, zona_id, categoria_uso_sk, estado_sk, area_m2 FROM estado;

    /* ---------------- Registro */
    INSERT INTO control.registro_carga
    SELECT @ahora, @corte, t, n FROM (VALUES
        ('DimLocal',               (SELECT COUNT(*) FROM gold.DimLocal)),
        ('FactContratos',          (SELECT COUNT(*) FROM gold.FactContratos)),
        ('FactCuotas',             (SELECT COUNT(*) FROM gold.FactCuotas)),
        ('FactPagos',              (SELECT COUNT(*) FROM gold.FactPagos)),
        ('FactReservas',           (SELECT COUNT(*) FROM gold.FactReservas)),
        ('FactActividadComercial', (SELECT COUNT(*) FROM gold.FactActividadComercial)),
        ('FactEstadoLocalMensual', (SELECT COUNT(*) FROM gold.FactEstadoLocalMensual))
    ) v(t, n);
END;
