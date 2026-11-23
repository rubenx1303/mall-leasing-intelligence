-- Modelo operativo (fuente OLTP de la demostración): centro comercial FICTICIO en explotación
-- (locales, inquilinos, contratos de arrendamiento, recibos, pagos, reservas y actividad comercial).
-- No depende de ningún sistema real. Datos FICTICIOS.
-- Importes en COP enteros (BIGINT). Fechas DATE.

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA IF NOT EXISTS comercial;
SET search_path = comercial;

DROP TABLE IF EXISTS pago, cuota, contrato, reserva, actividad, cliente, elemento_plano, local, categoria, zona, planta, parametros CASCADE;

CREATE TABLE parametros (
  clave text PRIMARY KEY,
  valor text NOT NULL
);

CREATE TABLE planta (
  id       smallint PRIMARY KEY,
  codigo   text NOT NULL UNIQUE,
  nombre   text NOT NULL,
  nivel    smallint NOT NULL,
  ancho    integer NOT NULL,
  alto     integer NOT NULL
);

CREATE TABLE zona (
  id        smallint PRIMARY KEY,
  planta_id smallint NOT NULL REFERENCES planta(id),
  codigo    text NOT NULL UNIQUE,
  nombre    text NOT NULL,
  tipo      text NOT NULL CHECK (tipo IN ('ancla', 'galeria', 'plaza', 'comidas'))
);

CREATE TABLE categoria (
  id     smallint PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  grupo  text NOT NULL
);

CREATE TABLE local (
  id                integer PRIMARY KEY,
  codigo            text NOT NULL UNIQUE,
  planta_id         smallint NOT NULL REFERENCES planta(id),
  zona_id           smallint NOT NULL REFERENCES zona(id),
  categoria_id      smallint REFERENCES categoria(id),
  tipo              text NOT NULL CHECK (tipo IN ('ancla', 'local', 'isla', 'tecnico')),
  comercializable   boolean NOT NULL,
  x integer NOT NULL, y integer NOT NULL, w integer NOT NULL CHECK (w > 0), h integer NOT NULL CHECK (h > 0),
  area_m2           numeric(10, 2) NOT NULL CHECK (area_m2 > 0),
  canon_m2          bigint NOT NULL DEFAULT 0 CHECK (canon_m2 >= 0),
  fecha_lanzamiento date,
  descripcion       text,
  CHECK (comercializable = (fecha_lanzamiento IS NOT NULL))
);

CREATE TABLE elemento_plano (
  id        serial PRIMARY KEY,
  planta_id smallint NOT NULL REFERENCES planta(id),
  tipo      text NOT NULL,
  etiqueta  text NOT NULL,
  x integer NOT NULL, y integer NOT NULL, w integer NOT NULL, h integer NOT NULL
);

-- Sin datos personales: código interno y marca ficticia.
CREATE TABLE cliente (
  id               integer PRIMARY KEY,
  codigo           text NOT NULL UNIQUE,
  nombre_comercial text NOT NULL,
  categoria_id     smallint NOT NULL REFERENCES categoria(id),
  tipo_persona     text NOT NULL CHECK (tipo_persona IN ('juridica', 'natural')),
  canal            text NOT NULL,
  fecha_alta       date NOT NULL
);

CREATE TABLE actividad (
  id         integer PRIMARY KEY,
  cliente_id integer NOT NULL REFERENCES cliente(id),
  local_id   integer NOT NULL REFERENCES local(id),
  tipo       text NOT NULL CHECK (tipo IN ('lead', 'visita', 'propuesta', 'reserva', 'contrato', 'renovacion', 'desistimiento')),
  fecha      date NOT NULL,
  canal      text NOT NULL
);
CREATE INDEX ix_actividad_local_fecha ON actividad (local_id, fecha);

CREATE TABLE reserva (
  id                 integer PRIMARY KEY,
  codigo             text NOT NULL UNIQUE,
  local_id           integer NOT NULL REFERENCES local(id),
  cliente_id         integer NOT NULL REFERENCES cliente(id),
  fecha_reserva      date NOT NULL,
  fecha_vencimiento  date NOT NULL,
  fecha_cierre       date,
  estado             text NOT NULL CHECK (estado IN ('activa', 'convertida', 'vencida', 'cancelada')),
  importe_separacion bigint NOT NULL CHECK (importe_separacion >= 0),
  CHECK (fecha_vencimiento >= fecha_reserva),
  CHECK (fecha_cierre IS NULL OR fecha_cierre >= fecha_reserva),
  -- Regla de negocio en la base: dos reservas del mismo local no pueden solaparse.
  CONSTRAINT ex_reserva_sin_solape EXCLUDE USING gist (
    local_id WITH =,
    daterange(fecha_reserva, COALESCE(fecha_cierre, fecha_vencimiento + 1), '[)') WITH &&
  )
);

CREATE TABLE contrato (
  id                integer PRIMARY KEY,
  codigo            text NOT NULL UNIQUE,
  local_id          integer NOT NULL REFERENCES local(id),
  cliente_id        integer NOT NULL REFERENCES cliente(id),
  reserva_id        integer REFERENCES reserva(id),
  renovacion_de     integer REFERENCES contrato(id),
  tipo              text NOT NULL CHECK (tipo = 'arriendo'),
  categoria_id      smallint NOT NULL REFERENCES categoria(id),
  fecha_firma       date NOT NULL,
  fecha_inicio      date NOT NULL,
  fecha_fin         date NOT NULL,
  fecha_terminacion date,
  plazo_meses       integer NOT NULL CHECK (plazo_meses > 0),
  area_m2           numeric(10, 2) NOT NULL CHECK (area_m2 > 0),
  canon_mensual     bigint NOT NULL CHECK (canon_mensual > 0),
  valor_total       bigint NOT NULL CHECK (valor_total > 0),
  valor_lista       bigint NOT NULL CHECK (valor_lista > 0),
  estado            text NOT NULL CHECK (estado IN ('vigente', 'finalizado', 'rescindido')),
  CHECK (fecha_fin >= fecha_inicio),
  CHECK (fecha_terminacion IS NULL OR (fecha_terminacion > fecha_inicio AND fecha_terminacion <= fecha_fin)),
  -- Regla de negocio en la base: los contratos de un mismo local no pueden solaparse.
  CONSTRAINT ex_contrato_sin_solape EXCLUDE USING gist (
    local_id WITH =,
    daterange(fecha_inicio, COALESCE(fecha_terminacion, fecha_fin + 1), '[)') WITH &&
  )
);

CREATE TABLE cuota (
  id                integer PRIMARY KEY,
  contrato_id       integer NOT NULL REFERENCES contrato(id),
  numero            integer NOT NULL,
  concepto          text NOT NULL CHECK (concepto = 'canon'),
  fecha_emision     date NOT NULL,
  fecha_vencimiento date NOT NULL,
  importe           bigint NOT NULL CHECK (importe > 0),
  UNIQUE (contrato_id, numero),
  UNIQUE (id, contrato_id),
  CHECK (fecha_vencimiento >= fecha_emision)
);

CREATE TABLE pago (
  id          integer PRIMARY KEY,
  cuota_id    integer NOT NULL,
  contrato_id integer NOT NULL,
  fecha_pago  date NOT NULL,
  importe     bigint NOT NULL CHECK (importe > 0),
  medio       text NOT NULL,
  -- El pago debe pertenecer a una cuota del mismo contrato.
  FOREIGN KEY (cuota_id, contrato_id) REFERENCES cuota (id, contrato_id)
);
CREATE INDEX ix_pago_cuota ON pago (cuota_id);
