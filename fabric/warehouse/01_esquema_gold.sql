/* =====================================================================================
   Mall Leasing Intelligence — Fabric Warehouse «WH_Mall» — capa GOLD (estrella)
   Datos FICTICIOS. Pensado para el dialecto T-SQL de Fabric Warehouse:
   VARCHAR (sin NVARCHAR), restricciones PRIMARY KEY / FOREIGN KEY «NOT ENFORCED»,
   claves sustitutas = id de origen (estables) y miembro −1 «Desconocido».
   ESTADO: escrito y revisado, NO ejecutado todavía en Fabric (sin capacidad disponible).
   ===================================================================================== */

IF SCHEMA_ID('gold') IS NULL EXEC('CREATE SCHEMA gold');
IF SCHEMA_ID('control') IS NULL EXEC('CREATE SCHEMA control');
GO

-- Recreación idempotente (entorno de desarrollo): se borran y se vuelven a crear las tablas
DROP TABLE IF EXISTS gold.FactEstadoLocalMensual, gold.FactActividadComercial, gold.FactReservas, gold.FactPagos,
                     gold.FactCuotas, gold.FactContratos, gold.DimEstadoComercial, gold.DimLocal, gold.DimCategoria,
                     gold.DimZona, gold.DimFecha, control.kpi_esperado, control.registro_carga;
GO

/* ----------------------------------------------------------------------- DIMENSIONES */

CREATE TABLE gold.DimFecha (
    fecha_sk        INT          NOT NULL,   -- AAAAMMDD
    fecha           DATE         NOT NULL,
    anio            SMALLINT     NOT NULL,
    trimestre       SMALLINT     NOT NULL,
    mes             SMALLINT     NOT NULL,
    nombre_mes      VARCHAR(12)  NOT NULL,
    anio_mes        CHAR(7)      NOT NULL,   -- AAAA-MM
    dia_semana      SMALLINT     NOT NULL,   -- 1 = lunes
    es_fin_mes      BIT          NOT NULL
);
ALTER TABLE gold.DimFecha ADD CONSTRAINT pk_DimFecha PRIMARY KEY NONCLUSTERED (fecha_sk) NOT ENFORCED;

CREATE TABLE gold.DimZona (
    zona_sk         INT          NOT NULL,
    zona_codigo     VARCHAR(10)  NOT NULL,
    zona_nombre     VARCHAR(60)  NOT NULL,
    zona_tipo       VARCHAR(20)  NOT NULL,
    planta_codigo   VARCHAR(5)   NOT NULL,
    planta_nombre   VARCHAR(30)  NOT NULL,
    planta_nivel    SMALLINT     NOT NULL
);
ALTER TABLE gold.DimZona ADD CONSTRAINT pk_DimZona PRIMARY KEY NONCLUSTERED (zona_sk) NOT ENFORCED;

CREATE TABLE gold.DimCategoria (
    categoria_sk     INT         NOT NULL,
    categoria_codigo VARCHAR(5)  NOT NULL,
    categoria_nombre VARCHAR(60) NOT NULL,
    grupo            VARCHAR(30) NOT NULL
);
ALTER TABLE gold.DimCategoria ADD CONSTRAINT pk_DimCategoria PRIMARY KEY NONCLUSTERED (categoria_sk) NOT ENFORCED;

CREATE TABLE gold.DimLocal (
    local_sk          INT           NOT NULL,
    local_codigo      VARCHAR(20)   NOT NULL,
    tipo_local        VARCHAR(10)   NOT NULL,
    comercializable   BIT           NOT NULL,
    area_m2           DECIMAL(10,2) NOT NULL,
    precio_lista_m2   BIGINT        NOT NULL,
    canon_m2          BIGINT        NOT NULL,
    fecha_lanzamiento DATE          NULL,
    zona_sk           INT           NOT NULL,
    categoria_uso_sk  INT           NOT NULL,   -- uso previsto (−1 si no comercializable)
    planta_codigo     VARCHAR(5)    NOT NULL,
    zona_nombre       VARCHAR(60)   NOT NULL,
    descripcion       VARCHAR(120)  NULL
);
ALTER TABLE gold.DimLocal ADD CONSTRAINT pk_DimLocal PRIMARY KEY NONCLUSTERED (local_sk) NOT ENFORCED;

CREATE TABLE gold.DimEstadoComercial (
    estado_sk          INT          NOT NULL,
    estado_codigo      VARCHAR(25)  NOT NULL,
    estado_nombre      VARCHAR(40)  NOT NULL,
    orden              SMALLINT     NOT NULL,
    comercializable    BIT          NOT NULL,
    cuenta_como_venta  BIT          NOT NULL    -- solo «contrato_firmado»: una reserva NO es venta
);
ALTER TABLE gold.DimEstadoComercial ADD CONSTRAINT pk_DimEstado PRIMARY KEY NONCLUSTERED (estado_sk) NOT ENFORCED;

/* ---------------------------------------------------------------------------- HECHOS */

-- Una fila por contrato
CREATE TABLE gold.FactContratos (
    contrato_id               INT           NOT NULL,
    contrato_codigo           VARCHAR(20)   NOT NULL,
    tipo_contrato             VARCHAR(10)   NOT NULL,
    estado_contrato           VARCHAR(10)   NOT NULL,
    cliente_codigo            VARCHAR(20)   NOT NULL,   -- dimensión degenerada
    local_sk                  INT           NOT NULL,
    zona_sk                   INT           NOT NULL,
    categoria_actividad_sk    INT           NOT NULL,
    fecha_firma_sk            INT           NOT NULL,
    area_m2                   DECIMAL(10,2) NOT NULL,
    valor_total               BIGINT        NOT NULL,
    valor_lista               BIGINT        NOT NULL,
    plazo_meses               INT           NOT NULL,
    dias_hasta_firma          INT           NOT NULL,   -- primer contacto del firmante con el local → firma
    dias_comercializacion     INT           NOT NULL    -- lanzamiento del local → firma
);

-- Una fila por cuota del plan de pagos (facturación)
CREATE TABLE gold.FactCuotas (
    cuota_id               INT          NOT NULL,
    contrato_id            INT          NOT NULL,
    local_sk               INT          NOT NULL,
    zona_sk                INT          NOT NULL,
    numero                 INT          NOT NULL,
    concepto               VARCHAR(20)  NOT NULL,
    fecha_emision_sk       INT          NOT NULL,
    fecha_vencimiento_sk   INT          NOT NULL,
    importe                BIGINT       NOT NULL
);

-- Una fila por pago recibido (cobro)
CREATE TABLE gold.FactPagos (
    pago_id                      INT          NOT NULL,
    cuota_id                     INT          NOT NULL,
    contrato_id                  INT          NOT NULL,
    local_sk                     INT          NOT NULL,
    zona_sk                      INT          NOT NULL,
    fecha_pago_sk                INT          NOT NULL,
    fecha_vencimiento_cuota_sk   INT          NOT NULL,
    importe                      BIGINT       NOT NULL,
    medio_pago                   VARCHAR(20)  NOT NULL
);

-- Una fila por reserva (acumulativa: alta, vencimiento, cierre)
CREATE TABLE gold.FactReservas (
    reserva_id               INT          NOT NULL,
    reserva_codigo           VARCHAR(20)  NOT NULL,
    cliente_codigo           VARCHAR(20)  NOT NULL,
    local_sk                 INT          NOT NULL,
    zona_sk                  INT          NOT NULL,
    categoria_interesado_sk  INT          NOT NULL,
    fecha_reserva_sk         INT          NOT NULL,
    fecha_vencimiento_sk     INT          NOT NULL,
    fecha_cierre_sk          INT          NOT NULL,   -- −1 si sigue abierta
    resultado                VARCHAR(15)  NOT NULL,   -- activa | convertida | vencida | cancelada (a la fecha de carga)
    importe_separacion       BIGINT       NOT NULL
);

-- Una fila por evento comercial
CREATE TABLE gold.FactActividadComercial (
    actividad_id             INT          NOT NULL,
    cliente_codigo           VARCHAR(20)  NOT NULL,
    local_sk                 INT          NOT NULL,
    zona_sk                  INT          NOT NULL,
    categoria_interesado_sk  INT          NOT NULL,
    fecha_sk                 INT          NOT NULL,
    tipo_evento              VARCHAR(15)  NOT NULL,
    canal                    VARCHAR(15)  NOT NULL
);

-- Instantánea periódica: local × cierre de mes (y la fecha de corte)
CREATE TABLE gold.FactEstadoLocalMensual (
    fecha_sk          INT           NOT NULL,
    local_sk          INT           NOT NULL,
    zona_sk           INT           NOT NULL,
    categoria_uso_sk  INT           NOT NULL,
    estado_sk         INT           NOT NULL,
    area_m2           DECIMAL(10,2) NOT NULL
);

/* ------------------------------------------------------------------------- CONTROL */

CREATE TABLE control.kpi_esperado (
    ambito   VARCHAR(20)     NOT NULL,   -- global | planta | zona
    clave    VARCHAR(20)     NOT NULL,   -- '' | P1 | P1-GN …
    kpi      VARCHAR(60)     NOT NULL,
    valor    DECIMAL(38,10)  NOT NULL
);

CREATE TABLE control.registro_carga (
    ejecutado_en  DATETIME2(6) NOT NULL,
    fecha_corte   DATE         NOT NULL,
    tabla         VARCHAR(60)  NOT NULL,
    filas         INT          NOT NULL
);
