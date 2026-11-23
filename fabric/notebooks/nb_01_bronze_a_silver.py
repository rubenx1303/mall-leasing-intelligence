# %% [markdown]
# # 01 · Bronze → Silver (Lakehouse «LH_Mall»)
#
# Mall Leasing Intelligence · datos **FICTICIOS**.
#
# 1. Lee el lote Bronze (Parquet, todo texto) de `Files/bronze/lote=AAAA-MM-DD/` y lo conserva tal cual
#    en tablas Delta `bronze_<entidad>` con metadatos de carga (lote, archivo, instante).
# 2. Limpia y tipa: recorta y normaliza estados, convierte fechas `dd/mm/aaaa`, importes con separador
#    de miles, elimina reenvíos duplicados.
# 3. Valida dominio e integridad referencial; lo que no pasa va a `silver_cuarentena` con el motivo.
# 4. Escribe `silver_<entidad>` (Delta) y el informe `silver_calidad`, y **falla** si las filas válidas no
#    coinciden con las que declara el manifiesto del lote.
#
# Las reglas son las mismas que verifica en local `fabric/bronze/exportar_bronze.py --verificar`.
# **Estado:** escrito y revisado; pendiente de ejecutar en Fabric (sin capacidad disponible aún).

# %% tags=["parameters"]
LOTE = "2026-11-20"

# %%
import json
from datetime import datetime, timezone

from pyspark.sql import DataFrame, Window
from pyspark.sql import functions as F

RUTA_LOTE = f"Files/bronze/lote={LOTE}"
# Ojo: Spark/Hadoop ignoran los archivos que empiezan por «_» o «.», por eso el manifiesto NO se llama «_manifiesto.json»
CARGADO_EN = datetime.now(timezone.utc).isoformat(timespec="seconds")

manifiesto = json.loads(spark.read.text(f"{RUTA_LOTE}/manifiesto.json", wholetext=True).first()[0])  # noqa: F821 (Fabric)
assert manifiesto["lote"] == LOTE, "El manifiesto no corresponde al lote indicado"

# Esquema de Silver: columna → tipo Spark SQL. El orden define la carga (primero dimensiones).
ESQUEMA = {
    "parametros": {"clave": "string", "valor": "string"},
    "planta": {"id": "int", "codigo": "string", "nombre": "string", "nivel": "int", "ancho": "int", "alto": "int"},
    "zona": {"id": "int", "planta_id": "int", "codigo": "string", "nombre": "string", "tipo": "string"},
    "categoria": {"id": "int", "codigo": "string", "nombre": "string", "grupo": "string"},
    "local": {
        "id": "int", "codigo": "string", "planta_id": "int", "zona_id": "int", "categoria_id": "int", "tipo": "string",
        "comercializable": "boolean", "x": "int", "y": "int", "w": "int", "h": "int", "area_m2": "decimal(10,2)",
        "precio_lista_m2": "bigint", "canon_m2": "bigint", "fecha_lanzamiento": "date", "descripcion": "string",
    },
    "elemento_plano": {"id": "int", "planta_id": "int", "tipo": "string", "etiqueta": "string", "x": "int", "y": "int", "w": "int", "h": "int"},
    "cliente": {
        "id": "int", "codigo": "string", "nombre_comercial": "string", "categoria_id": "int",
        "tipo_persona": "string", "canal": "string", "fecha_alta": "date",
    },
    "reserva": {
        "id": "int", "codigo": "string", "local_id": "int", "cliente_id": "int", "fecha_reserva": "date",
        "fecha_vencimiento": "date", "fecha_cierre": "date", "estado": "string", "importe_separacion": "bigint",
    },
    "contrato": {
        "id": "int", "codigo": "string", "local_id": "int", "cliente_id": "int", "reserva_id": "int", "tipo": "string",
        "categoria_id": "int", "fecha_firma": "date", "area_m2": "decimal(10,2)", "valor_total": "bigint",
        "valor_lista": "bigint", "plazo_meses": "int", "estado": "string",
    },
    "cuota": {
        "id": "int", "contrato_id": "int", "numero": "int", "concepto": "string",
        "fecha_emision": "date", "fecha_vencimiento": "date", "importe": "bigint",
    },
    "pago": {"id": "int", "cuota_id": "int", "contrato_id": "int", "fecha_pago": "date", "importe": "bigint", "medio": "string"},
    "actividad": {"id": "int", "cliente_id": "int", "local_id": "int", "tipo": "string", "fecha": "date", "canal": "string"},
}
CLAVE = {"parametros": "clave"}
IMPORTES_COP = {"importe", "importe_separacion", "valor_total", "valor_lista", "precio_lista_m2", "canon_m2"}
NORMALIZAR = {"estado", "tipo", "concepto", "canal", "tipo_persona", "medio"}

# Reglas de dominio: (nombre, condición que deben CUMPLIR las filas válidas)
DOMINIO = {
    "local": [("tipo_valido", F.col("tipo").isin("ancla", "local", "isla", "tecnico")), ("area_positiva", F.col("area_m2") > 0)],
    "reserva": [
        ("estado_valido", F.col("estado").isin("activa", "convertida", "vencida", "cancelada")),
        ("vencimiento_posterior", F.col("fecha_vencimiento") >= F.col("fecha_reserva")),
    ],
    "contrato": [
        ("tipo_valido", F.col("tipo").isin("venta", "arriendo")),
        ("estado_valido", F.col("estado").isin("vigente", "resuelto")),
        ("valor_positivo", F.col("valor_total") > 0),
    ],
    "cuota": [("importe_positivo", F.col("importe") > 0), ("vencimiento_posterior", F.col("fecha_vencimiento") >= F.col("fecha_emision"))],
    "pago": [("importe_positivo", F.col("importe") > 0)],
    "actividad": [("tipo_valido", F.col("tipo").isin("lead", "visita", "propuesta", "reserva", "contrato", "desistimiento"))],
}
# Integridad referencial: entidad → [(columna, entidad padre, columna padre)]
REFERENCIAS = {
    "zona": [("planta_id", "planta", "id")],
    "local": [("zona_id", "zona", "id"), ("planta_id", "planta", "id")],
    "cliente": [("categoria_id", "categoria", "id")],
    "reserva": [("local_id", "local", "id"), ("cliente_id", "cliente", "id")],
    "contrato": [("local_id", "local", "id"), ("cliente_id", "cliente", "id")],
    "cuota": [("contrato_id", "contrato", "id")],
    "pago": [("cuota_id", "cuota", "id")],
    "actividad": [("local_id", "local", "id"), ("cliente_id", "cliente", "id")],
}

# %% [markdown]
# ## 1 · Bronze: conservar el lote tal cual (Delta, particionado por lote)

# %%
def guardar_bronze(entidad: str) -> DataFrame:
    df = (
        spark.read.parquet(f"{RUTA_LOTE}/{entidad}.parquet")  # noqa: F821 (sesión Spark de Fabric)
        .withColumn("_lote", F.lit(LOTE))
        .withColumn("_archivo", F.col("_metadata.file_path"))
        .withColumn("_cargado_en", F.lit(CARGADO_EN))
    )
    tabla = f"bronze_{entidad}"
    if spark.catalog.tableExists(tabla):  # noqa: F821
        df.write.format("delta").mode("overwrite").option("replaceWhere", f"_lote = '{LOTE}'").saveAsTable(tabla)
    else:
        df.write.format("delta").partitionBy("_lote").saveAsTable(tabla)
    return spark.table(tabla).where(F.col("_lote") == LOTE)  # noqa: F821


bronze = {e: guardar_bronze(e) for e in ESQUEMA}
print({e: df.count() for e, df in bronze.items()})

# %% [markdown]
# ## 2 · Limpieza y tipado

# %%
def fecha(col: str):
    c = F.trim(F.col(col))
    return F.when(c.contains("/"), F.to_date(c, "dd/MM/yyyy")).otherwise(F.to_date(c, "yyyy-MM-dd"))


def limpiar(entidad: str, df: DataFrame) -> DataFrame:
    salida = []
    for col, tipo in ESQUEMA[entidad].items():
        c = F.col(col)
        if col in NORMALIZAR:
            expr = F.lower(F.trim(c))
        elif col == "codigo":
            expr = F.trim(c)
        elif tipo == "date":
            expr = fecha(col)
        elif col in IMPORTES_COP:
            expr = F.regexp_replace(F.trim(c), r"\.", "").cast("bigint")
        else:
            expr = c.cast(tipo) if tipo != "string" else c
        salida.append(expr.cast(tipo).alias(col))
    return df.select(*salida)


cuarentena: list[DataFrame] = []
calidad = []
silver: dict[str, DataFrame] = {}


def a_cuarentena(entidad: str, regla: str, df: DataFrame):
    cuarentena.append(
        df.select(
            F.lit(LOTE).alias("lote"), F.lit(entidad).alias("entidad"), F.lit(regla).alias("regla"),
            F.to_json(F.struct(*df.columns)).alias("registro"), F.lit(CARGADO_EN).alias("detectado_en"),
        )
    )


for entidad in ESQUEMA:
    clave = CLAVE.get(entidad, "id")
    df = limpiar(entidad, bronze[entidad])
    n_bronze = df.count()

    # Reenvíos: duplicados exactos tras normalizar
    df = df.dropDuplicates()
    duplicados = n_bronze - df.count()

    # Misma clave con contenido distinto: conflicto → cuarentena (no se elige una versión a ciegas)
    w = Window.partitionBy(clave)
    df = df.withColumn("_n", F.count("*").over(w))
    a_cuarentena(entidad, "clave_en_conflicto", df.where("_n > 1").drop("_n"))
    df = df.where("_n = 1").drop("_n")

    invalidas = 0
    for regla, cond in [("clave_nula", F.col(clave).isNotNull())] + DOMINIO.get(entidad, []):
        malas = df.where(~F.coalesce(cond, F.lit(False)))
        n = malas.count()
        if n:
            a_cuarentena(entidad, regla, malas)
            invalidas += n
        df = df.where(F.coalesce(cond, F.lit(False)))

    for col, padre, col_padre in REFERENCIAS.get(entidad, []):
        ref = silver[padre].select(F.col(col_padre).alias("_ref")).distinct()
        unido = df.join(ref, df[col] == ref["_ref"], "left")
        huerfanas = unido.where(F.col("_ref").isNull() & F.col(col).isNotNull()).drop("_ref")
        n = huerfanas.count()
        if n:
            a_cuarentena(entidad, f"huerfana_{col}", huerfanas)
            invalidas += n
        df = unido.where(F.col("_ref").isNotNull() | F.col(col).isNull()).drop("_ref")

    if entidad == "pago":  # el pago debe pertenecer a una cuota del MISMO contrato
        q = silver["cuota"].select(F.col("id").alias("_q"), F.col("contrato_id").alias("_c"))
        unido = df.join(q, (df["cuota_id"] == q["_q"]) & (df["contrato_id"] == q["_c"]), "left")
        malas = unido.where(F.col("_q").isNull()).drop("_q", "_c")
        n = malas.count()
        if n:
            a_cuarentena(entidad, "pago_contrato_distinto_de_cuota", malas)
            invalidas += n
        df = unido.where(F.col("_q").isNotNull()).drop("_q", "_c")

    df = df.cache()
    silver[entidad] = df
    n_silver = df.count()
    esperadas = manifiesto["filas_validas_esperadas_en_silver"].get(entidad)
    calidad.append((LOTE, entidad, n_bronze, duplicados, invalidas, n_silver, esperadas, n_silver == esperadas, CARGADO_EN))

# %% [markdown]
# ## 3 · Escritura de Silver, cuarentena e informe de calidad

# %%
for entidad, df in silver.items():
    df.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(f"silver_{entidad}")

if cuarentena:
    from functools import reduce

    reduce(DataFrame.unionByName, cuarentena).write.format("delta").mode("append").saveAsTable("silver_cuarentena")

informe = spark.createDataFrame(  # noqa: F821
    calidad,
    "lote string, entidad string, filas_bronze long, duplicados_eliminados long, filas_cuarentena long, "
    "filas_silver long, filas_esperadas long, cuadra boolean, ejecutado_en string",
)
informe.write.format("delta").mode("append").saveAsTable("silver_calidad")
display(informe)  # noqa: F821

fallos = [c[1] for c in calidad if not c[7]]
if fallos:
    raise ValueError(f"Silver no cuadra con el manifiesto en: {fallos}")
print("Silver correcto: todas las entidades coinciden con las filas válidas declaradas en el manifiesto")
