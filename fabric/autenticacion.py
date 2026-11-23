"""Credencial de Entra ID compartida por los scripts de Fabric.

Inicio de sesión interactivo la primera vez; después, silencioso gracias a la caché de tokens de MSAL
(cifrada con DPAPI en Windows) y a un «registro de autenticación» que solo contiene identificadores de
la cuenta (no secretos), guardado fuera del repositorio en %LOCALAPPDATA%\\mli-fabric\\.
"""
from __future__ import annotations

import os
from pathlib import Path

from azure.identity import AuthenticationRecord, InteractiveBrowserCredential, TokenCachePersistenceOptions

_REGISTRO = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "mli-fabric" / "registro_autenticacion.json"
_CACHE = TokenCachePersistenceOptions(name="mli-fabric")


def credencial(tenant: str) -> InteractiveBrowserCredential:
    if _REGISTRO.exists():
        registro = AuthenticationRecord.deserialize(_REGISTRO.read_text(encoding="utf-8"))
        return InteractiveBrowserCredential(tenant_id=tenant, cache_persistence_options=_CACHE, authentication_record=registro)
    cred = InteractiveBrowserCredential(tenant_id=tenant, cache_persistence_options=_CACHE)
    print("Abriendo el navegador para iniciar sesión en Microsoft (solo la primera vez)…", flush=True)
    registro = cred.authenticate(scopes=["https://api.fabric.microsoft.com/.default"])
    _REGISTRO.parent.mkdir(parents=True, exist_ok=True)
    _REGISTRO.write_text(registro.serialize(), encoding="utf-8")
    return cred
