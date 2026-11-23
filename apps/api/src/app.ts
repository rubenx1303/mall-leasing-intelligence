import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import {
  alertas,
  analisisComercial,
  analisisFinanciero,
  catalogos,
  crearContexto,
  detalleLocal,
  localesVista,
  resumen,
  type Dataset,
  type EstadoComercial,
  type EstadoContractual,
  type Filtro,
  type TipoLocal,
} from '@mli/core';

export interface OpcionesApp {
  /** Devuelve el conjunto de datos (desde PostgreSQL en producción, en memoria en pruebas). */
  fuente: () => Promise<Dataset>;
  nombreFuente: string;
  /** Información del origen (p. ej. última ejecución del pipeline) para /api/salud. */
  infoFuente?: () => Promise<Record<string, unknown> | null>;
  origenesCors?: string[];
  logger?: boolean;
}

const queryFiltro = {
  type: 'object',
  additionalProperties: false,
  properties: {
    corte: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    planta: { type: 'integer', minimum: 1 },
    zona: { type: 'integer', minimum: 1 },
    categoria: { type: 'integer', minimum: 1 },
    tipo: { type: 'string', enum: ['ancla', 'local', 'isla', 'tecnico'] },
    contrato: { type: 'string', enum: ['vigente', 'por_vencer', 'sin_contrato'] },
    estado: { type: 'string', enum: ['ocupado', 'reservado', 'disponible', 'no_comercializable'] },
  },
} as const;

interface QueryFiltro {
  corte?: string;
  planta?: number;
  zona?: number;
  categoria?: number;
  tipo?: TipoLocal;
  contrato?: EstadoContractual;
  estado?: EstadoComercial;
}

export async function crearApp(op: OpcionesApp): Promise<FastifyInstance> {
  // removeAdditional: false → los parámetros desconocidos se rechazan (400) en vez de ignorarse.
  const app = Fastify({ logger: op.logger ?? false, ajv: { customOptions: { removeAdditional: false } } });

  await app.register(cors, {
    origin: op.origenesCors ?? ['http://localhost:5173'],
    methods: ['GET'],
  });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
  });

  const contexto = async (q: QueryFiltro) => {
    const ds = await op.fuente();
    const filtro: Filtro = {};
    if (q.planta) filtro.plantaId = q.planta;
    if (q.zona) filtro.zonaId = q.zona;
    if (q.categoria) filtro.categoriaId = q.categoria;
    if (q.tipo) filtro.tipoLocal = q.tipo;
    if (q.contrato) filtro.estadoContrato = q.contrato;
    return crearContexto(ds, { corte: q.corte, filtro });
  };

  const conFiltro = { schema: { querystring: queryFiltro } };

  app.get('/api/salud', async () => {
    const ds = await op.fuente();
    return {
      ok: true,
      fuente: op.nombreFuente,
      origen: op.infoFuente ? await op.infoFuente() : null,
      centro: ds.meta.centro,
      ficticio: ds.meta.ficticio,
      fechaCorte: ds.meta.fechaCorte,
      registros: {
        locales: ds.locales.length,
        reservas: ds.reservas.length,
        contratos: ds.contratos.length,
        cuotas: ds.cuotas.length,
        pagos: ds.pagos.length,
      },
    };
  });

  app.get('/api/catalogos', async () => catalogos(await op.fuente()));

  app.get<{ Querystring: QueryFiltro }>('/api/resumen', conFiltro, async (req) => resumen(await contexto(req.query)));

  app.get<{ Querystring: QueryFiltro }>('/api/locales', conFiltro, async (req) => {
    const vista = localesVista(await contexto(req.query));
    return req.query.estado ? vista.filter((l) => l.estado === req.query.estado) : vista;
  });

  app.get<{ Params: { codigo: string }; Querystring: QueryFiltro }>(
    '/api/locales/:codigo',
    { schema: { querystring: queryFiltro, params: { type: 'object', properties: { codigo: { type: 'string', maxLength: 20 } } } } },
    async (req, reply) => {
      const d = detalleLocal(await contexto({ corte: req.query.corte }), req.params.codigo);
      if (!d) return reply.code(404).send({ error: 'Local no encontrado' });
      return d;
    },
  );

  app.get<{ Querystring: QueryFiltro }>('/api/comercial', conFiltro, async (req) => analisisComercial(await contexto(req.query)));
  app.get<{ Querystring: QueryFiltro }>('/api/financiero', conFiltro, async (req) => analisisFinanciero(await contexto(req.query)));
  app.get<{ Querystring: QueryFiltro }>('/api/alertas', conFiltro, async (req) => alertas(await contexto(req.query)));

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    reply.code(status).send({ error: status >= 500 ? 'Error interno' : err.message });
  });

  return app;
}
