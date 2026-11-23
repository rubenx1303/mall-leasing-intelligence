# Artefactos de Microsoft Fabric

> **Versión del modelo:** lo ejecutado en Fabric (23-11-2026) corresponde al **modelo de datos v1** (preventa de
> locales). La aplicación local usa el **modelo v2** (centro en explotación, con alquileres y cobros) y un pipeline
> equivalente **local** (`pipeline/`, PostgreSQL + pandas). Adaptar estos artefactos al v2 está pendiente.
> La aplicación no necesita Fabric para funcionar.

Datos FICTICIOS. Configuración del entorno: copia [entorno.example.json](entorno.example.json) a `entorno.dev.json`
(no versionado) y rellena inquilino, área de trabajo y Lakehouse. Las pruebas se hicieron sobre una capacidad
**F2 de desarrollo**, que se pausa cuando no se usa (unos 0,40 USD/h encendida).

## Estado (23-11-2026)

| Paso | Artefacto | Estado en Fabric |
|---|---|---|
| Bronze: extracción | `bronze/exportar_bronze.py` → Parquet + `manifiesto.json` | **Ejecutado.** 13 archivos subidos a `LH_Mall/Files/bronze/lote=2026-11-20` con `bronze/subir_onelake.py` (tamaño y MD5 verificados) |
| Bronze → Silver | `notebooks/nb_01_bronze_a_silver` (PySpark, Runtime 2.0 · Spark 4.1) | **Ejecutado y validado** (498 s). Las 12 entidades cuadran con el manifiesto; 10 duplicados eliminados; 4 filas en cuarentena (2 actividades huérfanas, 1 pago con importe 0, 1 pago de cuota inexistente) |
| Warehouse | `WH_Mall` creado por API | **Creado** |
| Gold: esquema y carga | `warehouse/01_esquema_gold.sql`, `02_usp_cargar_gold.sql` | **Creados** (tablas y procedimiento). Carga **no ejecutada** |
| KPIs y validación | `warehouse/03_vistas_kpi.sql`, `90_esperados.sql` | **No ejecutados.** `03` falló por columnas sin nombre en una CTE; ya corregido, sin volver a ejecutar |
| Power BI / DAX | `powerbi/medidas.dax` | **No ejecutado** |

### Para terminar (≈5 min de capacidad)

```powershell
.\.venv\Scripts\python.exe -X utf8 fabric\ejecutar_sql.py --servidor <servidor SQL> archivos 03_vistas_kpi.sql 90_esperados.sql
.\.venv\Scripts\python.exe -X utf8 fabric\ejecutar_sql.py --servidor <servidor SQL> consulta "EXEC gold.usp_cargar_gold" "SELECT resultado, COUNT(*) FROM control.v_validacion_kpi GROUP BY resultado"
```

El servidor SQL lo muestra `fabric\desplegar.py warehouse`. Las cifras de Gold solo se dan por buenas cuando la
validación devuelve 56 «OK» y ningún «FALLO».

## Herramientas (todo por API, sin pasos manuales en la interfaz)

| Script | Qué hace |
|---|---|
| `entorno.py` | Carga `entorno.dev.json` (no versionado) |
| `autenticacion.py` | Entra ID: navegador la primera vez, después caché de tokens cifrada (DPAPI) |
| `bronze/subir_onelake.py` | Sube el lote a OneLake por la API compatible con ADLS Gen2 y verifica MD5 |
| `desplegar.py notebook ejecutar` | Crea/actualiza el notebook (ligado a `LH_Mall`) y lo ejecuta como trabajo por lotes |
| `desplegar.py warehouse` | Crea `WH_Mall` y muestra su cadena de conexión |
| `ejecutar_sql.py` | Ejecuta scripts T-SQL (lotes separados por `GO`) y consultas por TDS con token de Entra ID |
| `capacidad.py estado\|pausar` | Consulta o pausa la capacidad (requiere `AZURE_SUBSCRIPTION_ID` y `AZURE_RESOURCE_GROUP`) |

## Flujo

```
Postgres ──exportar_bronze.py──▶ Files/bronze/lote=AAAA-MM-DD/*.parquet + manifiesto.json   (OneLake)
            ──nb_01 (PySpark)──▶ bronze_* (Delta, por lote) ─▶ silver_* (Delta) + silver_cuarentena + silver_calidad
            ──gold.usp_cargar_gold (T-SQL)──▶ WH_Mall.gold.* (estrella)
            ──control.v_validacion_kpi──▶ 0 filas «FALLO» = las cifras cuadran con la aplicación
Canalización (Data Factory, pendiente): [Notebook nb_01] → [Procedimiento usp_cargar_gold] → [Script: validación]
```

## Lecciones aprendidas

- Spark/Hadoop ignoran los archivos que empiezan por `_` o `.`: el manifiesto se llama `manifiesto.json`.
- Spark 4 activa el modo ANSI: las conversiones de tipo inválidas fallan en lugar de dar nulos (por eso la limpieza
  separa explícitamente los formatos de fecha).
- En una F2 cada acción Spark cuesta segundos: el notebook hace ~60 recuentos de control y tarda ~8 min.
- La subida a OneLake desde el navegador queda dentro de un iframe de otro dominio: se usó la API de Data Lake con
  Entra ID.
- El controlador ODBC instalado no admitía Entra ID: se usó `mssql-python` con token de acceso.
- El portal de Azure puede proponer F64 por defecto: elegir F2 y revisar la protección de excedente.
