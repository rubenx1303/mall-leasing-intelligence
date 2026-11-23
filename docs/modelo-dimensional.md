> **Modelo v2 (demo actual):** la implementación local está en `pipeline/gold.sql` (PostgreSQL). Cambios respecto a
> este documento: los contratos son de **arrendamiento** (inicio, fin, rescisión, renovación), `FactCuotas` se llama
> `fact_recibo` (recibos mensuales de renta), la instantánea es `fact_ocupacion_mensual` (incluye la renta del contrato
> vigente) y se añaden `dim_planta`, `dim_cliente` (sin datos personales) y `ref_elemento_plano`. El diseño de abajo
> (granularidades, reglas contra la doble contabilización) sigue siendo válido.

# Fase 2 — Modelo dimensional (Gold)

Esquema en estrella para Fabric Warehouse (`gold`) y el modelo semántico de Power BI. Datos FICTICIOS.
DDL: [fabric/warehouse/](../fabric/warehouse/). Definiciones de KPI: [kpis.md](kpis.md).

## Procesos de negocio y granularidad

| Hecho | Una fila por… | Tipo | Medidas aditivas | Por qué existe |
|---|---|---|---|---|
| `FactContratos` | contrato firmado | Transacción | m², valor total, valor de lista, días hasta firma, días de comercialización | Valor contratado, superficie comercializada, descuentos, tiempos |
| `FactCuotas` | cuota del plan de pagos | Transacción | importe | **Facturado** (emitidas) y calendario de cobros; necesaria para no inferir la facturación a partir de los pagos |
| `FactPagos` | pago recibido | Transacción | importe | **Cobrado**; un pago lleva su cuota y su contrato |
| `FactReservas` | reserva | Transacción acumulativa (fechas de alta, vencimiento y cierre) | importe de separación, días de vigencia | Reservas activas, por vencer y conversión |
| `FactActividadComercial` | evento comercial (lead, visita, propuesta, reserva, contrato, desistimiento) | Transacción sin importe | recuento | Demanda por actividad, embudo y conversión |
| `FactEstadoLocalMensual` | local × cierre de mes (y fecha de corte) | Instantánea periódica | m² (semiaditiva en el tiempo) | Evolución del % comercialización sin lógica temporal compleja en DAX |

`FactCuotas` y `FactEstadoLocalMensual` amplían la lista inicial: la primera porque «facturado» y «cobrado» son
procesos distintos; la segunda porque el estado de un local es una foto en el tiempo, no un evento.

## Dimensiones

| Dimensión | Clave | Atributos | Notas |
|---|---|---|---|
| `DimFecha` | `fecha_sk` = AAAAMMDD | fecha, año, trimestre, mes, nombre del mes, año-mes, fin de mes, día de la semana | Rol múltiple: firma, emisión, vencimiento, pago, reserva, evento, instantánea |
| `DimLocal` | `local_sk` (id de origen) | código, tipo, superficie, comercializable, precios de lista, fecha de lanzamiento, planta, zona, uso previsto | SCD 1 (geometría y precios de lista estáticos en la demo). Si cambian los precios: SCD 2 |
| `DimZona` | `zona_sk` | código, nombre, tipo, planta (código, nombre, nivel) | Planta desnormalizada en la zona (jerarquía Planta → Zona → Local) |
| `DimCategoria` | `categoria_sk` | código, nombre, grupo | Rol múltiple: uso previsto del local, actividad del firmante, actividad del interesado |
| `DimEstadoComercial` | `estado_sk` | código, nombre, orden, comercializable, `cuenta_como_venta` (solo contrato firmado = 1) | La reserva **no** cuenta como venta por diseño |

Miembro «desconocido» con clave −1 en cada dimensión para claves nulas o huérfanas (ninguna fila de hecho queda fuera).
Los interesados no forman dimensión: su código es una **dimensión degenerada** (no hay datos personales que modelar).

## Matriz de bus

| | Fecha | Local | Zona | Categoría | Estado |
|---|---|---|---|---|---|
| FactContratos | firma | ✓ | ✓ | actividad del firmante | — |
| FactCuotas | emisión, vencimiento | ✓ | ✓ | — | — |
| FactPagos | pago, vencimiento de la cuota | ✓ | ✓ | — | — |
| FactReservas | reserva, vencimiento, cierre | ✓ | ✓ | actividad del interesado | — |
| FactActividadComercial | evento | ✓ | ✓ | actividad del interesado | — |
| FactEstadoLocalMensual | cierre de mes | ✓ | ✓ | uso previsto | ✓ |

## Reglas contra la doble contabilización

1. El valor se suma en `FactContratos`, la facturación en `FactCuotas` y el cobro en `FactPagos`; nunca se suma
   un importe de contrato después de unirlo con cuotas o pagos.
2. Las relaciones del modelo semántico son de una dimensión a muchos hechos, con filtro en una sola dirección.
   Los hechos no se relacionan entre sí.
3. `FactEstadoLocalMensual` es semiaditiva: en DAX se toma la última instantánea del periodo filtrado
   (`LASTNONBLANK` sobre la fecha), nunca la suma de meses.
4. Silver deduplica los reenvíos de origen (ver Bronze): un pago reenviado no puede duplicar el cobrado.

## Relaciones del modelo semántico (previstas)

Activas: `DimFecha[fecha_sk]` → fecha principal de cada hecho (firma, emisión, pago, reserva, evento, instantánea).
Inactivas (con `USERELATIONSHIP`): vencimiento de cuota y de reserva. `DimLocal` → todos los hechos;
`DimZona` y `DimCategoria` filtran a través de `DimLocal` o directamente donde la clave es propia del hecho.
