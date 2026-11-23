> **Estado actual:** la demo funciona en local con el flujo completo Operativo → Bronce → Plata → Oro → Panel
> (ver el [README](../README.md)). Lo descrito como «objetivo» con Fabric se probó parcialmente
> (Bronce y Plata ejecutados en Fabric con el modelo v1).

# Arquitectura

## Hoy (fase 1, verificada)

```
 [Generador ficticio]──seed──▶ PostgreSQL 16 (esquema «comercial», OLTP)
        │                         │  restricciones: FK, CHECK, EXCLUDE (sin solape de reservas),
        │                         │  índice único parcial (1 contrato vigente por local)
        │                         ▼
        │                  API REST Fastify (rol de solo lectura) ──▶ React (Vite, Tailwind, Recharts, SVG)
        │                         │
        └──── packages/core ◀─────┘  (KPIs de referencia, compartidos por API, web y pruebas)
```

## Objetivo (fases 2–6) — Microsoft Fabric

```
 Fuentes                 BRONZE (Lakehouse)        SILVER (Lakehouse)            GOLD (Warehouse)            Consumo
 ─────────               ───────────────────       ──────────────────            ────────────────            ───────
 PostgreSQL demo  ─┐     Archivos/Delta tal cual   Notebooks PySpark:             Modelo en estrella T-SQL:   Power BI (Direct Lake)
 CSV/Parquet demo ─┼─▶   + metadatos de carga  ─▶  limpieza, tipos, fechas,   ─▶  DimLocal, DimZona,      ─▶  medidas DAX, RLS
 Dataverse (demo) ─┘     (Data Factory)            duplicados, integridad,        DimCategoria, DimFecha,     App web (opcional,
                                                   controles de calidad           DimEstadoComercial,         vía endpoint SQL)
                                                                                  FactContratos, FactPagos,
                                                                                  FactReservas,
                                                                                  FactActividadComercial
```

Granularidades previstas: FactContratos (1 fila por contrato), FactPagos (1 por pago, con la cuota),
FactReservas (1 por reserva), FactActividadComercial (1 por evento comercial). Un hecho periódico de estado
(local × mes) permitirá medir la evolución de la comercialización sin recalcular en DAX.

La lógica de `packages/core/src/kpis.ts` y `pipeline/gold.sql` es la especificación que se portará a T-SQL y DAX;
las pruebas actuales servirán de casos de control para validar las cifras en Fabric.

### Integración con un CRM (futura, solo lectura)

No implementada. El diseño previsto es una extracción **de solo lectura** por un método oficial
(réplica o vista de lectura, API documentada o exportación programada), con credenciales en un almacén de secretos,
usuario técnico de mínimo privilegio y sin datos personales innecesarios. Pendiente.
