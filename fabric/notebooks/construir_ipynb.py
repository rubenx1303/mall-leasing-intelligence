"""Convierte los notebooks en formato «percent» (# %%) a .ipynb para importarlos en Fabric.
Fuente revisable en Git: nb_*.py · artefacto importable: nb_*.ipynb (generado, no editar)."""
import json
import re
import sys
from pathlib import Path

CARPETA = Path(__file__).parent


def convertir(ruta: Path) -> Path:
    texto = ruta.read_text(encoding="utf-8")
    bloques = re.split(r"^# %%(.*)$", texto, flags=re.M)
    celdas = []
    # bloques = [prefijo, cabecera1, cuerpo1, cabecera2, cuerpo2, ...]
    for cab, cuerpo in zip(bloques[1::2], bloques[2::2]):
        cuerpo = cuerpo.strip("\n")
        lineas = cuerpo.splitlines(keepends=True)
        if "[markdown]" in cab:
            fuente = [re.sub(r"^# ?", "", l) for l in lineas]
            celdas.append({"cell_type": "markdown", "metadata": {}, "source": fuente})
        else:
            meta = {"tags": ["parameters"]} if "parameters" in cab else {}
            celdas.append({"cell_type": "code", "metadata": meta, "execution_count": None, "outputs": [], "source": lineas})
    nb = {
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {
            "kernelspec": {"name": "synapse_pyspark", "display_name": "Synapse PySpark", "language": "Python"},
            "language_info": {"name": "python"},
        },
        "cells": celdas,
    }
    destino = ruta.with_suffix(".ipynb")
    destino.write_text(json.dumps(nb, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return destino


if __name__ == "__main__":
    for r in sorted(CARPETA.glob("nb_*.py")):
        print("→", convertir(r).name)
    sys.exit(0)
