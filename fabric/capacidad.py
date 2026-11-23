"""
Estado y pausa de la capacidad de Fabric por la API de Azure Resource Manager (sin portal).

  estado   muestra el estado (Active / Paused / …), el SKU y la región   — solo lectura, sin coste
  pausar   suspende la capacidad (deja de facturar cómputo) y espera a que figure como Paused

No hay acción para reanudar a propósito: reanudar genera coste y lo decide el usuario en el portal.
Uso: .venv\\Scripts\\python.exe fabric/capacidad.py estado|pausar
Requiere fabric/entorno.dev.json y las variables AZURE_SUBSCRIPTION_ID y AZURE_RESOURCE_GROUP.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from autenticacion import credencial  # noqa: E402
from entorno import cargar  # noqa: E402

CONFIG = cargar()
# Suscripción y grupo de recursos de la capacidad: se leen del entorno, nunca del código.
SUB = os.environ.get("AZURE_SUBSCRIPTION_ID", "")
RG = os.environ.get("AZURE_RESOURCE_GROUP", "")
if not SUB or not RG:
    print("Define AZURE_SUBSCRIPTION_ID y AZURE_RESOURCE_GROUP (suscripción y grupo de la capacidad).", file=sys.stderr)
    raise SystemExit(2)
NOMBRE = CONFIG["capacidad"]["nombre"]
URL = f"https://management.azure.com/subscriptions/{SUB}/resourceGroups/{RG}/providers/Microsoft.Fabric/capacities/{NOMBRE}"
VER = {"api-version": "2023-11-01"}


def cabeceras() -> dict:
    tok = credencial(CONFIG["tenant"]).get_token("https://management.azure.com/.default").token
    return {"Authorization": f"Bearer {tok}"}


def estado() -> dict:
    r = requests.get(URL, params=VER, headers=cabeceras(), timeout=60)
    r.raise_for_status()
    j = r.json()
    p = j.get("properties", {})
    return {"nombre": j["name"], "estado": p.get("state"), "aprovisionamiento": p.get("provisioningState"),
            "sku": j.get("sku", {}).get("name"), "region": j.get("location")}


def main() -> int:
    accion = sys.argv[1] if len(sys.argv) > 1 else "estado"
    e = estado()
    print(json.dumps(e, ensure_ascii=False))
    if accion == "pausar":
        if e["estado"] == "Paused":
            print("Ya está en pausa: no se hace nada.")
            return 0
        r = requests.post(f"{URL}/suspend", params=VER, headers=cabeceras(), timeout=60)
        if r.status_code not in (200, 202):
            print(f"Error al pausar: {r.status_code} {r.text[:400]}")
            return 1
        for _ in range(40):
            time.sleep(15)
            e = estado()
            print(f"  {e['estado']}")
            if e["estado"] == "Paused":
                print("Capacidad en pausa.")
                return 0
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
