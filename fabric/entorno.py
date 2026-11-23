"""
Carga la configuración del entorno de Fabric desde fabric/entorno.dev.json (no versionado).

Copia fabric/entorno.example.json a fabric/entorno.dev.json y rellena los identificadores de tu
inquilino, área de trabajo y Lakehouse. No son secretos, pero son propios de cada cuenta.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

RUTA = Path(__file__).resolve().parent / "entorno.dev.json"


def cargar() -> dict:
    if not RUTA.exists():
        print(f"Falta {RUTA.name}: copia entorno.example.json a entorno.dev.json y rellénalo.", file=sys.stderr)
        raise SystemExit(2)
    return json.loads(RUTA.read_text(encoding="utf-8"))
