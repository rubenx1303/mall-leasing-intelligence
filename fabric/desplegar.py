"""
Despliegue y ejecución en Microsoft Fabric mediante la API REST (sin pasos manuales en la interfaz).

  notebook   crea o actualiza el notebook desde fabric/notebooks/<nombre>.ipynb, ligado al Lakehouse
  ejecutar   lanza el notebook como trabajo por lotes y espera el resultado (la sesión Spark termina sola)
  warehouse  crea el Warehouse si no existe y muestra su cadena de conexión SQL

Autenticación: Entra ID (fabric/autenticacion.py): navegador la primera vez, después caché de tokens cifrada (DPAPI).
Ejemplo:
  .venv\\Scripts\\python.exe fabric/desplegar.py notebook ejecutar --nombre nb_01_bronze_a_silver
"""
from __future__ import annotations

import argparse
import base64
import json
import sys
import time
from pathlib import Path

import requests
from autenticacion import credencial

API = "https://api.fabric.microsoft.com/v1"
RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))
from entorno import cargar  # noqa: E402

CONFIG = cargar()
WS = CONFIG["workspaceId"]


class Fabric:
    def __init__(self, tenant: str):
        self.cred = credencial(tenant)

    def _h(self) -> dict:
        tok = self.cred.get_token("https://api.fabric.microsoft.com/.default").token
        return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

    def req(self, metodo: str, ruta: str, **kw) -> requests.Response:
        url = ruta if ruta.startswith("http") else f"{API}{ruta}"
        r = requests.request(metodo, url, headers=self._h(), timeout=60, **kw)
        if r.status_code == 429:
            espera = int(r.headers.get("Retry-After", "20"))
            print(f"  limitado (429), reintento en {espera}s")
            time.sleep(espera)
            return self.req(metodo, ruta, **kw)
        if r.status_code >= 400:
            raise RuntimeError(f"{metodo} {ruta} → {r.status_code}: {r.text[:800]}")
        return r

    def esperar_operacion(self, r: requests.Response) -> None:
        """Operaciones de larga duración (202 + x-ms-operation-id)."""
        if r.status_code != 202:
            return
        op = r.headers.get("x-ms-operation-id")
        while True:
            time.sleep(int(r.headers.get("Retry-After", "3")))
            s = self.req("GET", f"/operations/{op}").json()
            if s["status"] in ("Succeeded", "Failed"):
                if s["status"] == "Failed":
                    raise RuntimeError(f"Operación fallida: {s}")
                return

    def items(self, tipo: str) -> dict[str, dict]:
        r = self.req("GET", f"/workspaces/{WS}/items", params={"type": tipo}).json()
        return {i["displayName"]: i for i in r.get("value", [])}


def definicion_notebook(nombre: str) -> dict:
    nb = json.loads((RAIZ / "notebooks" / f"{nombre}.ipynb").read_text(encoding="utf-8"))
    lh = CONFIG["lakehouse"]
    nb["metadata"]["dependencies"] = {
        "lakehouse": {
            "default_lakehouse": lh["id"],
            "default_lakehouse_name": lh["nombre"],
            "default_lakehouse_workspace_id": WS,
        }
    }
    carga = base64.b64encode(json.dumps(nb, ensure_ascii=False).encode("utf-8")).decode()
    return {"format": "ipynb", "parts": [{"path": "notebook-content.ipynb", "payload": carga, "payloadType": "InlineBase64"}]}


def desplegar_notebook(f: Fabric, nombre: str) -> str:
    existentes = f.items("Notebook")
    definicion = definicion_notebook(nombre)
    if nombre in existentes:
        nid = existentes[nombre]["id"]
        f.esperar_operacion(f.req("POST", f"/workspaces/{WS}/notebooks/{nid}/updateDefinition", json={"definition": definicion}))
        print(f"Notebook actualizado: {nombre} ({nid})")
    else:
        r = f.req("POST", f"/workspaces/{WS}/notebooks", json={"displayName": nombre, "definition": definicion})
        f.esperar_operacion(r)
        nid = f.items("Notebook")[nombre]["id"]
        print(f"Notebook creado: {nombre} ({nid})")
    return nid


def ejecutar_notebook(f: Fabric, nombre: str, parametros: dict[str, str]) -> None:
    nid = f.items("Notebook")[nombre]["id"]
    lh = CONFIG["lakehouse"]
    cuerpo = {
        "executionData": {
            "parameters": {k: {"value": v, "type": "string"} for k, v in parametros.items()},
            "configuration": {"defaultLakehouse": {"name": lh["nombre"], "id": lh["id"], "workspaceId": WS}},
        }
    }
    r = f.req("POST", f"/workspaces/{WS}/items/{nid}/jobs/instances?jobType=RunNotebook", json=cuerpo)
    ubicacion = r.headers["Location"]
    inicio = time.time()
    print(f"Trabajo lanzado: {ubicacion.rsplit('/', 1)[-1]}")
    while True:
        time.sleep(15)
        s = f.req("GET", ubicacion).json()
        print(f"  {int(time.time() - inicio):>4}s  {s['status']}")
        if s["status"] in ("Completed", "Failed", "Cancelled", "Deduped"):
            if s["status"] != "Completed":
                raise RuntimeError(f"El notebook terminó en {s['status']}: {json.dumps(s.get('failureReason'), ensure_ascii=False)}")
            print(f"Notebook completado en {int(time.time() - inicio)} s")
            return


def crear_warehouse(f: Fabric, nombre: str) -> None:
    existentes = f.items("Warehouse")
    if nombre not in existentes:
        f.esperar_operacion(f.req("POST", f"/workspaces/{WS}/warehouses", json={"displayName": nombre}))
        existentes = f.items("Warehouse")
        print(f"Warehouse creado: {nombre}")
    wid = existentes[nombre]["id"]
    props = f.req("GET", f"/workspaces/{WS}/warehouses/{wid}").json().get("properties", {})
    print(json.dumps({"id": wid, "connectionString": props.get("connectionString")}, indent=2))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("acciones", nargs="+", choices=["notebook", "ejecutar", "warehouse"])
    ap.add_argument("--nombre", default="nb_01_bronze_a_silver")
    ap.add_argument("--lote", default="2026-11-20")
    a = ap.parse_args()
    f = Fabric(CONFIG["tenant"])
    for accion in a.acciones:
        if accion == "notebook":
            desplegar_notebook(f, a.nombre)
        elif accion == "ejecutar":
            ejecutar_notebook(f, a.nombre, {"LOTE": a.lote})
        elif accion == "warehouse":
            crear_warehouse(f, CONFIG["warehouse"]["nombre"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
