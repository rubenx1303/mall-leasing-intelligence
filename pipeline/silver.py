"""
SILVER (local): limpieza, normalización y validación del lote Bronze con pandas.

Mismas reglas que el notebook PySpark ejecutado en Fabric (fabric/notebooks/nb_01_bronze_a_silver.py):
  1. Tipado y normalización: estados en minúsculas y sin espacios, códigos recortados,
     fechas «dd/mm/aaaa» o ISO, importes con separador de miles.
  2. Eliminación de reenvíos (duplicados exactos).
  3. Claves en conflicto, campos obligatorios nulos, dominios y relaciones → cuarentena con el motivo.
  4. Comprobación final: las filas válidas deben coincidir con las que declara el manifiesto del lote.

Salida: data/lake/silver/*.parquet (tipado) y el esquema «silver» de PostgreSQL (para Gold en SQL).
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

# Columna → tipo (int, bigint, text, date, bool, decimal). El orden define la carga (padres primero).
ESQUEMA: dict[str, dict[str, str]] = {
    "parametros": {"clave": "text", "valor": "text"},
    "planta": {"id": "int", "codigo": "text", "nombre": "text", "nivel": "int", "ancho": "int", "alto": "int"},
    "zona": {"id": "int", "planta_id": "int", "codigo": "text", "nombre": "text", "tipo": "text"},
    "categoria": {"id": "int", "codigo": "text", "nombre": "text", "grupo": "text"},
    "local": {
        "id": "int", "codigo": "text", "planta_id": "int", "zona_id": "int", "categoria_id": "int", "tipo": "text",
        "comercializable": "bool", "x": "int", "y": "int", "w": "int", "h": "int", "area_m2": "decimal",
        "canon_m2": "bigint", "fecha_lanzamiento": "date", "descripcion": "text",
    },
    "elemento_plano": {"id": "int", "planta_id": "int", "tipo": "text", "etiqueta": "text", "x": "int", "y": "int", "w": "int", "h": "int"},
    "cliente": {"id": "int", "codigo": "text", "nombre_comercial": "text", "categoria_id": "int", "tipo_persona": "text", "canal": "text", "fecha_alta": "date"},
    "reserva": {
        "id": "int", "codigo": "text", "local_id": "int", "cliente_id": "int", "fecha_reserva": "date",
        "fecha_vencimiento": "date", "fecha_cierre": "date", "estado": "text", "importe_separacion": "bigint",
    },
    "contrato": {
        "id": "int", "codigo": "text", "local_id": "int", "cliente_id": "int", "reserva_id": "int", "renovacion_de": "int",
        "tipo": "text", "categoria_id": "int", "fecha_firma": "date", "fecha_inicio": "date", "fecha_fin": "date",
        "fecha_terminacion": "date", "plazo_meses": "int", "area_m2": "decimal", "canon_mensual": "bigint",
        "valor_total": "bigint", "valor_lista": "bigint", "estado": "text",
    },
    "cuota": {"id": "int", "contrato_id": "int", "numero": "int", "concepto": "text", "fecha_emision": "date", "fecha_vencimiento": "date", "importe": "bigint"},
    "pago": {"id": "int", "cuota_id": "int", "contrato_id": "int", "fecha_pago": "date", "importe": "bigint", "medio": "text"},
    "actividad": {"id": "int", "cliente_id": "int", "local_id": "int", "tipo": "text", "fecha": "date", "canal": "text"},
}
CLAVE = {"parametros": "clave"}
NULABLES = {
    "local": {"categoria_id", "fecha_lanzamiento", "descripcion"},
    "reserva": {"fecha_cierre"},
    "contrato": {"reserva_id", "renovacion_de", "fecha_terminacion"},
}
NORMALIZAR = {"estado", "tipo", "concepto", "canal", "tipo_persona", "medio"}
IMPORTES = {"importe", "importe_separacion", "valor_total", "valor_lista", "canon_m2", "canon_mensual"}

DOMINIO = {
    "local": [("tipo_valido", lambda d: d["tipo"].isin(["ancla", "local", "isla", "tecnico"])), ("area_positiva", lambda d: d["area_m2"] > 0)],
    "reserva": [
        ("estado_valido", lambda d: d["estado"].isin(["activa", "convertida", "vencida", "cancelada"])),
        ("vencimiento_posterior", lambda d: d["fecha_vencimiento"] >= d["fecha_reserva"]),
    ],
    "contrato": [
        ("tipo_valido", lambda d: d["tipo"] == "arriendo"),
        ("estado_valido", lambda d: d["estado"].isin(["vigente", "finalizado", "rescindido"])),
        ("renta_positiva", lambda d: d["canon_mensual"] > 0),
        ("fin_posterior_al_inicio", lambda d: d["fecha_fin"] >= d["fecha_inicio"]),
    ],
    "cuota": [("importe_positivo", lambda d: d["importe"] > 0), ("vencimiento_posterior", lambda d: d["fecha_vencimiento"] >= d["fecha_emision"])],
    "pago": [("importe_positivo", lambda d: d["importe"] > 0)],
    "actividad": [("tipo_valido", lambda d: d["tipo"].isin(["lead", "visita", "propuesta", "reserva", "contrato", "renovacion", "desistimiento"]))],
}
REFERENCIAS = {
    "zona": [("planta_id", "planta")],
    "local": [("zona_id", "zona"), ("planta_id", "planta")],
    "cliente": [("categoria_id", "categoria")],
    "reserva": [("local_id", "local"), ("cliente_id", "cliente")],
    "contrato": [("local_id", "local"), ("cliente_id", "cliente"), ("reserva_id", "reserva")],
    "cuota": [("contrato_id", "contrato")],
    "pago": [("cuota_id", "cuota")],
    "actividad": [("local_id", "local"), ("cliente_id", "cliente")],
}


def _fecha(s: pd.Series) -> pd.Series:
    s = s.str.strip()
    dmy = s.str.contains("/", na=False)
    iso = pd.to_datetime(s.where(~dmy), format="%Y-%m-%d", errors="coerce")
    otra = pd.to_datetime(s.where(dmy), format="%d/%m/%Y", errors="coerce")
    return iso.fillna(otra).dt.date


def limpiar(entidad: str, df: pd.DataFrame) -> pd.DataFrame:
    out = {}
    for col, tipo in ESQUEMA[entidad].items():
        s = df[col]
        if col in NORMALIZAR:
            s = s.str.strip().str.lower()
        elif col == "codigo":
            s = s.str.strip()
        if tipo == "date":
            s = _fecha(s)
        elif col in IMPORTES:
            s = pd.to_numeric(s.str.strip().str.replace(".", "", regex=False), errors="coerce").astype("Int64")
        elif tipo in ("int", "bigint"):
            s = pd.to_numeric(s, errors="coerce").astype("Int64")
        elif tipo == "bool":
            s = s.str.strip().str.lower().map({"true": True, "false": False}).astype("boolean")
        elif tipo == "decimal":
            s = pd.to_numeric(s, errors="coerce")
        out[col] = s
    return pd.DataFrame(out)


def procesar(carpeta_lote: Path) -> dict:
    manifiesto = json.loads((carpeta_lote / "manifiesto.json").read_text(encoding="utf-8"))
    silver: dict[str, pd.DataFrame] = {}
    cuarentena: list[dict] = []
    calidad: list[dict] = []

    def apartar(entidad: str, regla: str, malas: pd.DataFrame):
        for r in malas.astype(object).where(malas.notna(), None).to_dict("records"):
            cuarentena.append({"lote": manifiesto["lote"], "entidad": entidad, "regla": regla, "registro": json.dumps(r, default=str, ensure_ascii=False)})

    for entidad in ESQUEMA:
        bruto = pd.read_parquet(carpeta_lote / f"{entidad}.parquet")
        df = limpiar(entidad, bruto)
        n_bronze = len(df)
        df = df.drop_duplicates()
        duplicados = n_bronze - len(df)
        invalidas = 0

        k = CLAVE.get(entidad, "id")
        conflicto = df[k].duplicated(keep=False)
        if conflicto.any():
            apartar(entidad, "clave_en_conflicto", df[conflicto])
            invalidas += int(conflicto.sum())
            df = df[~conflicto]

        obligatorias = [c for c in ESQUEMA[entidad] if c not in NULABLES.get(entidad, set())]
        nulos = df[obligatorias].isna().any(axis=1)
        if nulos.any():
            apartar(entidad, "campo_obligatorio_nulo", df[nulos])
            invalidas += int(nulos.sum())
            df = df[~nulos]

        for regla, cond in DOMINIO.get(entidad, []):
            ok = cond(df).fillna(False).astype(bool)
            if (~ok).any():
                apartar(entidad, regla, df[~ok])
                invalidas += int((~ok).sum())
                df = df[ok]

        for col, padre in REFERENCIAS.get(entidad, []):
            huerfana = df[col].notna() & ~df[col].isin(silver[padre]["id"])
            if huerfana.any():
                apartar(entidad, f"huerfana_{col}", df[huerfana])
                invalidas += int(huerfana.sum())
                df = df[~huerfana]

        if entidad == "contrato":  # una renovación debe apuntar a un contrato existente
            huerfana = df["renovacion_de"].notna() & ~df["renovacion_de"].isin(df["id"])
            if huerfana.any():
                apartar(entidad, "huerfana_renovacion_de", df[huerfana])
                invalidas += int(huerfana.sum())
                df = df[~huerfana]
        if entidad == "pago":  # el pago debe pertenecer a un recibo del MISMO contrato
            q = silver["cuota"][["id", "contrato_id"]].rename(columns={"id": "cuota_id", "contrato_id": "_c"})
            unido = df.merge(q, on="cuota_id", how="left")
            mal = (unido["_c"] != unido["contrato_id"]).fillna(True).to_numpy(dtype=bool)
            if mal.any():
                apartar(entidad, "pago_contrato_distinto_del_recibo", df[mal])
                invalidas += int(mal.sum())
                df = df[~mal]

        silver[entidad] = df.reset_index(drop=True)
        esperadas = manifiesto["filas_validas_esperadas_en_silver"].get(entidad)
        calidad.append({
            "lote": manifiesto["lote"], "entidad": entidad, "filas_bronze": n_bronze, "duplicados_eliminados": duplicados,
            "filas_cuarentena": invalidas, "filas_silver": len(df), "filas_esperadas": esperadas, "cuadra": len(df) == esperadas,
        })

    return {"silver": silver, "cuarentena": pd.DataFrame(cuarentena), "calidad": pd.DataFrame(calidad), "lote": manifiesto["lote"]}


def _py(v):
    """Convierte escalares de numpy a tipos de Python para COPY."""
    return v.item() if hasattr(v, "item") else v


TIPO_SQL = {"int": "integer", "bigint": "bigint", "text": "text", "date": "date", "bool": "boolean", "decimal": "numeric(10,2)"}


def escribir(resultado: dict, carpeta_silver: Path, conn) -> None:
    """Parquet tipado en el lago local y tablas en el esquema «silver» de PostgreSQL."""
    carpeta_silver.mkdir(parents=True, exist_ok=True)
    for entidad, df in resultado["silver"].items():
        df.to_parquet(carpeta_silver / f"{entidad}.parquet", index=False)
    resultado["calidad"].to_parquet(carpeta_silver / "_calidad.parquet", index=False)
    if len(resultado["cuarentena"]):
        resultado["cuarentena"].to_parquet(carpeta_silver / "_cuarentena.parquet", index=False)

    with conn.cursor() as cur:
        cur.execute("DROP SCHEMA IF EXISTS gold CASCADE; DROP SCHEMA IF EXISTS silver CASCADE; CREATE SCHEMA silver;")
        for entidad, df in resultado["silver"].items():
            cols = ESQUEMA[entidad]
            cur.execute(f"CREATE TABLE silver.{entidad} ({', '.join(f'{c} {TIPO_SQL[t]}' for c, t in cols.items())})")
            with cur.copy(f"COPY silver.{entidad} ({', '.join(cols)}) FROM STDIN") as cp:
                for fila in df.astype(object).where(df.notna(), None).itertuples(index=False):
                    cp.write_row(tuple(_py(v) for v in fila))
        cur.execute("CREATE TABLE silver.calidad (lote text, entidad text, filas_bronze int, duplicados_eliminados int, filas_cuarentena int, filas_silver int, filas_esperadas int, cuadra boolean)")
        with cur.copy("COPY silver.calidad FROM STDIN") as cp:
            for fila in resultado["calidad"].itertuples(index=False):
                cp.write_row(tuple(_py(v) for v in fila))
        cur.execute("CREATE TABLE silver.cuarentena (lote text, entidad text, regla text, registro jsonb)")
        with cur.copy("COPY silver.cuarentena FROM STDIN") as cp:
            for fila in resultado["cuarentena"].itertuples(index=False):
                cp.write_row(tuple(fila))
