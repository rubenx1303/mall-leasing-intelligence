# Mall Leasing Intelligence

Panel de análisis para la dirección comercial de un centro comercial: ocupación, disponibilidad, contratos y
vencimientos, rentas, cobros y morosidad. Incluye una arquitectura de datos completa
**Operativo → Bronce → Plata → Oro → capa semántica → panel** que funciona en local, sin Azure ni servicios de pago,
y artefactos para Microsoft Fabric probados parcialmente.

> **Datos ficticios.** El «Centro Comercial Arboleda (ficticio)», sus 62 locales, los inquilinos (marcas
> inventadas), los contratos, las rentas y el plano son inventados y se generan con una semilla fija (14).
> Los importes son ficticios y se expresan en COP. No contiene datos, planos, credenciales ni recursos de ningún
> centro comercial real.

## Arquitectura

```
                   ┌──────────────────────── pipeline local (npm run pipeline) ─────────────────────────┐
Generador ficticio │                                                                                     │
(packages/core) ──▶ PostgreSQL «comercial» ─▶ BRONCE (Parquet) ─▶ PLATA (pandas) ─▶ ORO (SQL) ─▶ VALIDACIÓN
   semilla 14      │  (base operativa)        data/lake/bronze     data/lake/silver   esquema gold   121/121 KPI
                   │                          + manifiesto         + esquema silver   (estrella)
                   └─────────────────────────────────────────────────────────────────────────────────────┘
                                                                          │
                     API REST de solo lectura (Fastify) ◀─── lee ORO ─────┘
                     + capa semántica (packages/core/src/kpis.ts)
                                    │
                     Panel React (Vite, Tailwind, Recharts, SVG) ◀── o instantánea de ORO (sin servidor)
```

| Capa | Dónde | Qué hace |
|---|---|---|
| Base operativa | `apps/api/db/schema.sql`, esquema `comercial` | 12 tablas; claves, CHECK, exclusiones de solape de contratos y reservas |
| Bronce | `fabric/bronze/exportar_bronze.py` → `data/lake/bronze/lote=2026-11-20/` | Parquet (todo como texto) + `manifiesto.json` con 15 tipos de incidencias de calidad inyectadas a propósito |
| Plata | `pipeline/silver.py` → `data/lake/silver/`, esquema `silver` | Tipado, normalización, deduplicación, cuarentena y comprobación contra el manifiesto. En Fabric, el equivalente es el notebook PySpark `fabric/notebooks/nb_01_bronze_a_silver` |
| Oro | `pipeline/gold.sql`, esquema `gold` | Modelo en estrella: 7 dimensiones/referencias y 6 hechos (incluida la instantánea mensual de ocupación) |
| Capa semántica | `packages/core/src/kpis.ts` + vista `gold.v_kpi_calculado` | Los 121 KPI se calculan en TypeScript y en SQL; `control.v_validacion_kpi` compara ambas implementaciones |
| Panel | `apps/web` | 6 pantallas, 5 filtros, plano interactivo, fichas de local, alertas y exportación CSV |

Documentación: [modelo dimensional](docs/modelo-dimensional.md) · [definición de KPI](docs/kpis.md) ·
[arquitectura](docs/arquitectura.md) · [seguridad](docs/seguridad.md) · [entorno](docs/00-entorno-fabric.md) ·
[Fabric](fabric/README.md).

## Funcionalidades del panel

- **Resumen ejecutivo**: ocupación (m² y locales), renta mensual, facturado y cobrado (12 meses), vencido y
  morosidad, locales disponibles, contratos por vencer y renta en riesgo, WALT, rotación, inventario por estado,
  evolución de la ocupación, comparación por plantas, ocupación por zona y alertas prioritarias.
- **Explorador de locales**: plano SVG por planta coloreado por ocupación, contrato o actividad; búsqueda; ficha de
  cada local con superficie, estado, renta, contrato, recibos, historial de contratos, reservas y actividad comercial.
- **Ocupación y contratos**: vencimientos a 90/180/365 días con la deuda del inquilino, calendario de vencimientos,
  rotación mensual, rendimiento por zona, mezcla comercial, demanda por actividad y reservas activas.
- **Ingresos y cobros**: facturado y cobrado por mes, previsión a 12 meses, antigüedad de la deuda, inquilinos con
  deuda y recibos que vencen en 30 días.
- **Alertas** con regla explícita: contratos por vencer, pagos vencidos, reservas por vencer, locales vacíos más de
  180 días, zonas con baja ocupación y concentración de actividad.
- **Inventario de locales**: tabla ordenable y filtrable con exportación CSV.
- **Filtros** comunes a todas las pantallas: fecha de corte (cualquier cierre de mes), planta, zona, tipo de local y
  estado del contrato (vigente / vence en ≤ 90 días / sin contrato).
- Modo claro y oscuro; diseño adaptable a móvil.
- **Modo sin servidor**: si la API no responde, la web carga la instantánea de Oro incluida
  (`apps/web/public/demo/gold.json`) y lo indica en la barra lateral.

Escenario generado (corte 20-11-2026): 62 locales, 84 contratos, 2.497 recibos, 1.532 pagos, 83 reservas y 312
interesados. Ocupación 79,2 % (51/59 locales comercializables), morosidad 3,4 %, 8 contratos por vencer en 90 días.

## Pruebas

| Prueba | Comando | Resultado |
|---|---|---|
| Núcleo: coherencia del generador y KPI | `npm test -w @mli/core` | 33 pruebas |
| API: endpoints, filtros, validación de parámetros | `npm test -w @mli/api` (`api.test.ts`) | 9 pruebas |
| Integración PostgreSQL y Oro | `npm test -w @mli/api` (`postgres.test.ts`) | 5 pruebas: Oro reconstruye exactamente el conjunto generado, 0 KPI con fallo, la cuarentena contiene solo las 4 filas inválidas inyectadas y el rol de la API no puede escribir. Se omiten si no hay base de datos con Oro cargado |
| Web: formato y modo sin servidor | `npm test -w @mli/web` | 3 pruebas |
| Tipos TypeScript | `npm run typecheck` | Sin errores |
| Pipeline completo | `npm run pipeline` | Plata: 12/12 entidades cuadran con el manifiesto, 4 filas en cuarentena · **121/121 KPI coinciden** |

Total: 50 pruebas automáticas más la validación de 121 KPI en SQL.

## Microsoft Fabric

Ejecutado el 23-11-2026 en una capacidad **F2 de desarrollo**, con el **modelo de datos v1** (preventa de locales).
La aplicación local usa el modelo v2 (centro en explotación); los artefactos de Fabric no se han adaptado todavía.

| Paso | Resultado |
|---|---|
| Bronce en OneLake | 13 archivos subidos a `Files/bronze/lote=2026-11-20` del Lakehouse por la API de OneLake, con tamaño y MD5 verificados |
| Notebook PySpark Bronce → Plata | Ejecutado por la API REST de Fabric en 498 s (Runtime 2.0, Spark 4.1). 12 entidades cuadran con el manifiesto, 4 filas en cuarentena |
| Warehouse | Creado, con el esquema Gold (`01_esquema_gold.sql`) y el procedimiento de carga (`02_usp_cargar_gold.sql`) |
| Vistas de KPI | `03_vistas_kpi.sql` falló (columnas sin nombre en una CTE); está corregido pero **no se ha vuelto a ejecutar** |
| Carga de Gold y validación | **No ejecutadas** |
| Power BI / DAX | **No ejecutado** (medidas preparadas en `fabric/powerbi/medidas.dax`) |

Detalle y comandos para terminar: [fabric/README.md](fabric/README.md).

## Pendiente

- Adaptar el notebook y el T-SQL de Fabric al modelo v2.
- Volver a ejecutar las vistas de KPI, cargar Gold y validar en Fabric Warehouse.
- Power BI: modelo semántico e informes; verificar la equivalencia de las medidas DAX.
- Canalización de Data Factory / Dataflow Gen2 (descrita, no creada).
- Integración de solo lectura con un CRM o Dataverse (no iniciada).
- Autenticación de usuarios y seguridad por roles (RLS): solo documentadas en `docs/seguridad.md`.

## Cómo ejecutarlo

Requisitos: Node 20+. Para el flujo completo, además Docker y Python 3.11.
En PowerShell, si la política de ejecución bloquea `npm.ps1`, usa `npm.cmd`.

### Solo el panel (sin Docker ni Python)

```bash
npm ci
npm run dev:web
```

Abre http://localhost:5173. Sin API, el panel usa la instantánea de Oro incluida en el repositorio.

### Flujo completo (PostgreSQL + pipeline + API)

```bash
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
npm ci
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt      # Windows: .\.venv\Scripts\python.exe -m pip ...
npm run demo:restaurar
npm run dev:api
npm run dev:web
```

`demo:restaurar` arranca PostgreSQL en Docker (puerto local 54330), carga los datos ficticios, calcula los valores
de referencia de los KPI, ejecuta el pipeline completo y regenera la instantánea de Oro. Se puede repetir.

| Comando | Qué hace |
|---|---|
| `npm run demo:restaurar` | Base de datos, datos ficticios, pipeline completo e instantánea |
| `npm run pipeline` | Bronce → Plata → Oro → validación de 121 KPI |
| `npm test` | Pruebas automáticas de todos los paquetes |
| `npm run typecheck` | Comprobación de tipos TypeScript |
| `npm run build` | Compilación de la web |

## Estructura

```
packages/core   Generador ficticio, capa semántica (KPI) y alertas — TypeScript
apps/api        Base operativa (schema.sql, seed) y API REST de solo lectura sobre Oro — Fastify + PostgreSQL
pipeline/       Plata (pandas), Oro (SQL) y orquestador con validación — Python + SQL
apps/web        Panel — React, Vite, Tailwind, Recharts, plano SVG
fabric/         Artefactos de Microsoft Fabric (notebook PySpark, T-SQL, despliegue por API, DAX)
docs/           Modelo dimensional, KPI, arquitectura, seguridad, entorno
```

## API

`GET` con filtros opcionales `corte=AAAA-MM-DD`, `planta`, `zona`, `categoria`, `tipo` (ancla, local, isla, tecnico)
y `contrato` (vigente, por_vencer, sin_contrato). Los parámetros desconocidos devuelven 400.

`/api/salud` · `/api/catalogos` · `/api/resumen` · `/api/locales[?estado=]` · `/api/locales/:codigo` · `/api/comercial` ·
`/api/financiero` · `/api/alertas`

## Limitaciones

- Datos simulados: coherentes y variados, pero no reflejan el comportamiento de un mercado real.
- El plano es genérico (rectángulos SVG), no un plano arquitectónico.
- La capa semántica está en TypeScript; su equivalencia con SQL está probada, la de DAX no.
- La web no tiene usuarios ni autenticación (demo local de solo lectura).

## Licencia

[MIT](LICENSE).
