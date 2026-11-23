"""
Ejecuta scripts T-SQL en el Warehouse de Fabric (lotes separados por «GO») y consultas de control.

Conexión TDS con Entra ID interactivo (controlador mssql-python, sin ODBC instalado).
Uso:
  .venv\\Scripts\\python.exe fabric/ejecutar_sql.py --servidor <host>.datawarehouse.fabric.microsoft.com \
      archivos 01_esquema_gold.sql 02_usp_cargar_gold.sql ...
  .venv\\Scripts\\python.exe fabric/ejecutar_sql.py --servidor <host> consulta "SELECT ..."
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

import mssql_python

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))
from entorno import cargar  # noqa: E402

CONFIG = cargar()


def conectar(servidor: str, base: str):
    """Token de Entra ID (azure-identity) pasado al controlador como SQL_COPT_SS_ACCESS_TOKEN (1256)."""
    import struct

    from autenticacion import credencial

    token = credencial(CONFIG["tenant"]).get_token("https://database.windows.net/.default").token
    b = token.encode("utf-16-le")
    estructura = struct.pack(f"<I{len(b)}s", len(b), b)
    cadena = f"Server={servidor},1433;Database={base};Encrypt=yes;TrustServerCertificate=no;"
    return mssql_python.connect(cadena, autocommit=True, attrs_before={1256: estructura})


def lotes(sql: str) -> list[str]:
    return [b.strip() for b in re.split(r"^\s*GO\s*$", sql, flags=re.M | re.I) if b.strip()]


def mostrar(cur) -> None:
    if not cur.description:
        return
    cols = [d[0] for d in cur.description]
    filas = cur.fetchall()
    anchos = [max(len(str(c)), *(len(str(f[i])) for f in filas)) if filas else len(str(c)) for i, c in enumerate(cols)]
    print("  " + " | ".join(str(c).ljust(a) for c, a in zip(cols, anchos)))
    for f in filas:
        print("  " + " | ".join(str(v).ljust(a) for v, a in zip(f, anchos)))
    print(f"  ({len(filas)} filas)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--base", default=CONFIG["warehouse"]["nombre"])
    ap.add_argument("modo", choices=["archivos", "consulta"])
    ap.add_argument("valores", nargs="+")
    a = ap.parse_args()

    con = conectar(a.servidor, a.base)
    cur = con.cursor()
    if a.modo == "consulta":
        for q in a.valores:
            print(f"> {q}")
            cur.execute(q)
            mostrar(cur)
        return 0

    for nombre in a.valores:
        ruta = RAIZ / "warehouse" / nombre
        for i, b in enumerate(lotes(ruta.read_text(encoding="utf-8")), 1):
            t = time.time()
            try:
                cur.execute(b)
                while True:  # consume todos los conjuntos de resultados
                    if cur.description:
                        mostrar(cur)
                    if not cur.nextset():
                        break
            except Exception as e:  # noqa: BLE001
                print(f"✗ {nombre} lote {i}: {e}")
                return 1
            print(f"✓ {nombre} lote {i} ({time.time() - t:.1f} s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
