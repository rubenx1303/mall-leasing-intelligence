"""
Sube un lote Bronze a OneLake (Files del Lakehouse) por la API compatible con ADLS Gen2.

Autenticación: inicio de sesión interactivo de Entra ID en el navegador (InteractiveBrowserCredential).
Credencial compartida en fabric/autenticacion.py (caché de tokens cifrada). Tras subir, verifica tamaño y MD5 de cada archivo.

Uso:
  .venv\\Scripts\\python.exe fabric/bronze/subir_onelake.py --workspace <id> --lakehouse <id> [--lote 2026-11-20]
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from autenticacion import credencial  # noqa: E402
from azure.storage.filedatalake import ContentSettings, DataLakeServiceClient

RAIZ = Path(__file__).resolve().parents[2]
ONELAKE = "https://onelake.dfs.fabric.microsoft.com"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workspace", required=True, help="Id (GUID) del área de trabajo")
    ap.add_argument("--lakehouse", required=True, help="Id (GUID) del Lakehouse")
    ap.add_argument("--lote", default="2026-11-20")
    ap.add_argument("--tenant", default=None, help="Id o dominio del inquilino (opcional)")
    a = ap.parse_args()

    origen = RAIZ / "data" / "lake" / "bronze" / f"lote={a.lote}"
    archivos = sorted(p for p in origen.iterdir() if p.is_file())
    if not archivos:
        print(f"No hay archivos en {origen}: ejecuta antes «npm.cmd run bronze»", file=sys.stderr)
        return 2

    cred = credencial(a.tenant or "organizations")
    servicio = DataLakeServiceClient(ONELAKE, credential=cred)
    fs = servicio.get_file_system_client(a.workspace)
    destino = f"{a.lakehouse}/Files/bronze/lote={a.lote}"

    for p in archivos:
        datos = p.read_bytes()
        md5 = hashlib.md5(datos).digest()
        tipo = "application/json" if p.suffix == ".json" else "application/octet-stream"
        f = fs.get_file_client(f"{destino}/{p.name}")
        f.upload_data(datos, overwrite=True, content_settings=ContentSettings(content_type=tipo, content_md5=bytearray(md5)))
        props = f.get_file_properties()
        ok = props.size == len(datos)
        remoto_md5 = props.content_settings.content_md5
        if remoto_md5:
            ok = ok and bytes(remoto_md5) == md5
        print(f"  {'✓' if ok else '✗'} {p.name:24} {len(datos):>8} B  md5 {base64.b64encode(md5).decode()}")
        if not ok:
            return 1
    print(f"Subidos {len(archivos)} archivos a Files/bronze/lote={a.lote}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
