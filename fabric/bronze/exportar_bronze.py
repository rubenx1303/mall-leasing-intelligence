"""
Extracción BRONZE: PostgreSQL (fuente operativa de demostración) → Parquet + manifiesto.

Simula la entrega de un sistema origen tipo CRM: todas las columnas como texto, tal cual llegan,
con INCIDENCIAS DE CALIDAD CONTROLADAS (deterministas y registradas en el manifiesto) para que la
capa Silver tenga algo real que limpiar y se pueda comprobar que lo limpia bien:

  - duplicados exactos (reenvíos de filas)            → Silver deduplica por clave
  - fechas en dd/mm/aaaa mezcladas con ISO            → Silver normaliza
  - importes con separador de miles «1.234.000»       → Silver convierte a entero
  - estados/tipos con mayúsculas y espacios           → Silver normaliza
  - códigos con espacios sobrantes                    → Silver recorta
  - filas extra inválidas (huérfanas, importe ≤ 0)    → Silver las aparta a cuarentena

Todas las incidencias son REVERSIBLES o filas AÑADIDAS: tras una limpieza correcta, Silver debe ser
idéntico a la fuente y los KPIs de Gold deben coincidir con fabric/validacion/esperados.json.
Los datos son FICTICIOS.

Uso:
  .venv\\Scripts\\python.exe fabric/bronze/exportar_bronze.py            (exporta)
  .venv\\Scripts\\python.exe fabric/bronze/exportar_bronze.py --verificar  (exporta y comprueba la reversibilidad)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import psycopg

RAIZ = Path(__file__).resolve().parents[2]
SALIDA = RAIZ / "data" / "lake" / "bronze"
SEMILLA_INCIDENCIAS = 2026

TABLAS = [
    "parametros", "planta", "zona", "categoria", "local", "elemento_plano",
    "cliente", "actividad", "reserva", "contrato", "cuota", "pago",
]
CLAVE = {"parametros": "clave"}  # el resto usa «id»


def leer_env() -> dict[str, str]:
    env = dict(os.environ)
    f = RAIZ / ".env"
    if f.exists():
        for linea in f.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if linea and not linea.startswith("#") and "=" in linea:
                k, v = linea.split("=", 1)
                env.setdefault(k.strip(), v.strip())
    return env


def a_texto(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return str(v)


def extraer(conn: psycopg.Connection) -> dict[str, list[dict[str, str | None]]]:
    datos = {}
    with conn.cursor() as cur:
        for t in TABLAS:
            cur.execute(f"SELECT * FROM comercial.{t} ORDER BY {CLAVE.get(t, 'id')}")
            cols = [d.name for d in cur.description]
            datos[t] = [{c: a_texto(v) for c, v in zip(cols, fila)} for fila in cur.fetchall()]
    return datos


def iso_a_dmy(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}/{m}/{y}"


def miles(n: str) -> str:
    return f"{int(n):,}".replace(",", ".")


def inyectar_incidencias(datos: dict[str, list[dict]]) -> dict[str, dict[str, int]]:
    rng = random.Random(SEMILLA_INCIDENCIAS)
    reg: dict[str, dict[str, int]] = {}

    def anota(tabla: str, tipo: str, n: int = 1):
        reg.setdefault(tabla, {}).setdefault(tipo, 0)
        reg[tabla][tipo] += n

    # Estados y tipos con mayúsculas / espacios
    for tabla, col in [("reserva", "estado"), ("contrato", "estado"), ("local", "tipo"), ("actividad", "tipo")]:
        for f in datos[tabla]:
            if rng.random() < 0.2:
                f[col] = rng.choice([f[col].upper(), f" {f[col]}", f[col].capitalize() + " "])
                anota(tabla, f"{col}_formato")

    # Códigos de local con espacios
    for f in datos["local"]:
        if rng.random() < 0.1:
            f["codigo"] = f" {f['codigo']} "
            anota("local", "codigo_espacios")

    # Fechas en dd/mm/aaaa
    for tabla, cols in [("cuota", ["fecha_emision", "fecha_vencimiento"]), ("pago", ["fecha_pago"]), ("reserva", ["fecha_reserva"])]:
        for f in datos[tabla]:
            if rng.random() < 0.15:
                for c in cols:
                    f[c] = iso_a_dmy(f[c])
                anota(tabla, "fecha_dd_mm_aaaa")

    # Importes con separador de miles
    for f in datos["pago"]:
        if rng.random() < 0.1:
            f["importe"] = miles(f["importe"])
            anota("pago", "importe_con_miles")

    # Duplicados exactos (reenvíos)
    for tabla, p in [("actividad", 0.02), ("pago", 0.03), ("reserva", 0.02)]:
        extra = [dict(f) for f in datos[tabla] if rng.random() < p]
        datos[tabla].extend(extra)
        anota(tabla, "duplicado_exacto", len(extra))

    # Filas inválidas añadidas (deben ir a cuarentena)
    max_act = max(int(f["id"]) for f in datos["actividad"])
    plantilla = dict(datos["actividad"][0])
    for i in range(2):
        datos["actividad"].append({**plantilla, "id": str(max_act + 1 + i), "cliente_id": str(99000 + i)})
        anota("actividad", "huerfana_cliente")
    max_pago = max(int(f["id"]) for f in datos["pago"])
    base = dict(datos["pago"][0])
    datos["pago"].append({**base, "id": str(max_pago + 1), "importe": "0"})
    anota("pago", "importe_no_positivo")
    datos["pago"].append({**base, "id": str(max_pago + 2), "cuota_id": "999999"})
    anota("pago", "huerfano_cuota")

    # Orden de llegada no garantizado
    for t in ("actividad", "pago", "reserva"):
        rng.shuffle(datos[t])
    return reg


def escribir(datos: dict[str, list[dict]], lote: str) -> list[dict]:
    destino = SALIDA / f"lote={lote}"
    destino.mkdir(parents=True, exist_ok=True)
    archivos = []
    for t, filas in datos.items():
        cols = list(filas[0].keys()) if filas else []
        tabla = pa.table({c: pa.array([f.get(c) for f in filas], type=pa.string()) for c in cols})
        ruta = destino / f"{t}.parquet"
        pq.write_table(tabla, ruta, compression="snappy")
        md5 = hashlib.md5(ruta.read_bytes()).hexdigest()
        archivos.append({"entidad": t, "archivo": ruta.relative_to(SALIDA).as_posix(), "filas": len(filas), "md5": md5})
    return archivos


# ------------------------------------------------------------------ verificación local de reversibilidad

def limpiar_referencia(datos: dict[str, list[dict]]) -> dict[str, list[dict]]:
    """Reglas de limpieza de Silver, en Python puro, para demostrar que las incidencias son reversibles.
    El notebook PySpark (fabric/notebooks) implementa estas MISMAS reglas."""
    def fecha(v):
        if v is None:
            return None
        if "/" in v:
            d, m, y = v.split("/")
            return f"{y}-{m}-{d}"
        return v

    limpio = {}
    for t, filas in datos.items():
        vistos, salida = set(), []
        for f in filas:
            g = dict(f)
            for c in ("estado", "tipo", "codigo"):
                if c in g and g[c] is not None:
                    g[c] = g[c].strip()
                    if c != "codigo":
                        g[c] = g[c].lower()
            for c in list(g):
                if c.startswith("fecha"):
                    g[c] = fecha(g[c])
            if t == "pago" and g.get("importe"):
                g["importe"] = g["importe"].replace(".", "")
            k = g[CLAVE.get(t, "id")]
            if k in vistos:
                continue
            vistos.add(k)
            salida.append(g)
        limpio[t] = salida
    ids_cliente = {f["id"] for f in limpio["cliente"]}
    ids_cuota = {f["id"] for f in limpio["cuota"]}
    limpio["actividad"] = [f for f in limpio["actividad"] if f["cliente_id"] in ids_cliente]
    limpio["pago"] = [f for f in limpio["pago"] if f["cuota_id"] in ids_cuota and int(f["importe"]) > 0]
    return limpio


def exportar(verificar: bool = False) -> dict:
    """Extrae la base operativa a Bronze. Devuelve el manifiesto y la ruta del lote."""
    env = leer_env()
    dsn = env.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("Falta DATABASE_URL (.env)")
    # «localhost» puede resolverse a ::1 en Windows y el contenedor solo escucha en 127.0.0.1
    dsn = dsn.replace("@localhost:", "@127.0.0.1:")
    with psycopg.connect(dsn, connect_timeout=10) as conn:
        fuente = extraer(conn)

    lote = next(f["valor"] for f in fuente["parametros"] if f["clave"] == "fecha_corte")
    datos = {t: [dict(f) for f in filas] for t, filas in fuente.items()}
    incidencias = inyectar_incidencias(datos)
    archivos = escribir(datos, lote)

    manifiesto = {
        "origen": "PostgreSQL comercial (demostración, datos FICTICIOS)",
        "lote": lote,
        "extraido_en": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "formato": "parquet (todas las columnas como texto)",
        "archivos": archivos,
        "incidencias_inyectadas": incidencias,
        "filas_validas_esperadas_en_silver": {t: len(filas) for t, filas in fuente.items()},
        "semilla_incidencias": SEMILLA_INCIDENCIAS,
    }
    carpeta = SALIDA / f"lote={lote}"
    (carpeta / "manifiesto.json").write_text(json.dumps(manifiesto, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Bronze lote {lote}: {sum(a['filas'] for a in archivos)} filas en {len(archivos)} archivos → {carpeta}")
    for t, inc in incidencias.items():
        print(f"  {t}: {inc}")

    if verificar:
        leidos = {a["entidad"]: pq.read_table(SALIDA / a["archivo"]).to_pylist() for a in archivos}
        limpio = limpiar_referencia(leidos)
        for t, filas in fuente.items():
            k = CLAVE.get(t, "id")
            if sorted(filas, key=lambda f: f[k]) != sorted(limpio[t], key=lambda f: f[k]):
                raise RuntimeError(f"La limpieza de referencia no recupera la fuente en «{t}»")
        print("  ✓ Reversibilidad: aplicando las reglas de Silver, las 12 entidades coinciden con la fuente")
    return {"lote": lote, "carpeta": carpeta, "manifiesto": manifiesto}


def main() -> int:
    ap = argparse.ArgumentParser(description="Exportación Bronze (datos ficticios)")
    ap.add_argument("--verificar", action="store_true", help="comprueba que la limpieza de referencia recupera la fuente")
    args = ap.parse_args()
    try:
        exportar(args.verificar)
    except RuntimeError as e:
        print(f"✗ {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
