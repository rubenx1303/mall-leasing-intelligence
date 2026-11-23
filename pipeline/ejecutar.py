"""
Pipeline local completo (sin Azure):  base operativa → BRONZE → SILVER → GOLD → validación.

  1. Bronze  : PostgreSQL «comercial» → Parquet (texto) + manifiesto, con incidencias de calidad controladas.
  2. Silver  : limpieza, tipado, deduplicación, cuarentena (pandas) → Parquet + esquema «silver».
  3. Gold    : estrella e instantánea mensual en SQL (pipeline/gold.sql) → esquema «gold».
  4. Validar : los KPI calculados en SQL sobre Gold deben coincidir con los de referencia
               (fabric/validacion/esperados.json, generado por la capa semántica TypeScript).

Uso: .venv\\Scripts\\python.exe -X utf8 pipeline/ejecutar.py
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import psycopg

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "fabric" / "bronze"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from exportar_bronze import exportar, leer_env  # noqa: E402
import silver as capa_silver  # noqa: E402

LAGO = RAIZ / "data" / "lake"


def paso(nombre: str):
    print(f"\n── {nombre} " + "─" * (60 - len(nombre)), flush=True)
    return time.time()


def main() -> int:
    inicio = time.time()
    env = leer_env()
    dsn = env.get("DATABASE_ADMIN_URL", "").replace("@localhost:", "@127.0.0.1:")
    if not dsn:
        print("Falta DATABASE_ADMIN_URL (.env)", file=sys.stderr)
        return 2
    tiempos: dict[str, float] = {}

    t = paso("1 · BRONZE: extracción de la base operativa")
    bronze = exportar(verificar=True)
    tiempos["bronze"] = time.time() - t

    t = paso("2 · SILVER: limpieza, tipado y validación")
    res = capa_silver.procesar(bronze["carpeta"])
    cal = res["calidad"]
    print(cal[["entidad", "filas_bronze", "duplicados_eliminados", "filas_cuarentena", "filas_silver", "filas_esperadas", "cuadra"]].to_string(index=False))
    if not bool(cal["cuadra"].all()):
        print("✗ Silver no cuadra con el manifiesto", file=sys.stderr)
        return 1
    if len(res["cuarentena"]):
        print("Cuarentena:", res["cuarentena"].groupby(["entidad", "regla"]).size().to_dict())
    with psycopg.connect(dsn, autocommit=True, connect_timeout=10) as conn:
        capa_silver.escribir(res, LAGO / "silver", conn)
        tiempos["silver"] = time.time() - t

        t = paso("3 · GOLD: modelo en estrella (SQL)")
        with conn.cursor() as cur:
            cur.execute((Path(__file__).parent / "gold.sql").read_text(encoding="utf-8"))
            cur.execute("""SELECT 'dim_local', COUNT(*) FROM gold.dim_local UNION ALL SELECT 'dim_cliente', COUNT(*) FROM gold.dim_cliente
                           UNION ALL SELECT 'fact_contrato', COUNT(*) FROM gold.fact_contrato UNION ALL SELECT 'fact_recibo', COUNT(*) FROM gold.fact_recibo
                           UNION ALL SELECT 'fact_pago', COUNT(*) FROM gold.fact_pago UNION ALL SELECT 'fact_reserva', COUNT(*) FROM gold.fact_reserva
                           UNION ALL SELECT 'fact_actividad', COUNT(*) FROM gold.fact_actividad
                           UNION ALL SELECT 'fact_ocupacion_mensual', COUNT(*) FROM gold.fact_ocupacion_mensual""")
            filas_gold = dict(cur.fetchall())
            for k, v in filas_gold.items():
                print(f"  {k:24} {v:>6} filas")
        tiempos["gold"] = time.time() - t

        t = paso("4 · VALIDACIÓN: KPI de Gold (SQL) frente a la capa semántica")
        esperados = json.loads((RAIZ / "fabric" / "validacion" / "esperados.json").read_text(encoding="utf-8"))
        if esperados.get("version_modelo") != "2":
            print("✗ esperados.json no corresponde al modelo v2: ejecuta «npm.cmd run esperados»", file=sys.stderr)
            return 1
        with conn.cursor() as cur:
            cur.execute("DELETE FROM control.kpi_esperado")
            with cur.copy("COPY control.kpi_esperado (ambito, clave, kpi, valor) FROM STDIN") as cp:
                for f in esperados["kpis"]:
                    cp.write_row((f["ambito"], f["clave"], f["kpi"], f["valor"]))
            cur.execute("SELECT resultado, COUNT(*) FROM control.v_validacion_kpi GROUP BY resultado")
            resumen = dict(cur.fetchall())
            cur.execute("SELECT ambito, clave, kpi, esperado, calculado FROM control.v_validacion_kpi WHERE resultado = 'FALLO' LIMIT 20")
            fallos = cur.fetchall()
        ok, ko = int(resumen.get("OK", 0)), int(resumen.get("FALLO", 0))
        print(f"  {ok} KPI coinciden · {ko} no coinciden")
        for f in fallos:
            print("  ✗", f)
        tiempos["validacion"] = time.time() - t

        # Permisos de lectura para la API (rol de solo lectura)
        with conn.cursor() as cur:
            cur.execute("""DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mli_app') THEN
                             GRANT USAGE ON SCHEMA silver, gold, control TO mli_app;
                             GRANT SELECT ON ALL TABLES IN SCHEMA silver, gold, control TO mli_app;
                           END IF; END $$""")
            detalle = {
                "tiempos_s": {k: round(v, 2) for k, v in tiempos.items()},
                "filas_gold": filas_gold,
                "calidad": cal.astype(object).to_dict("records"),
                "incidencias_bronze": bronze["manifiesto"]["incidencias_inyectadas"],
            }
            cur.execute(
                "INSERT INTO control.ejecucion_pipeline (lote, segundos, kpis_ok, kpis_fallo, filas_cuarentena, detalle) VALUES (%s, %s, %s, %s, %s, %s)",
                (res["lote"], round(time.time() - inicio, 2), ok, ko, len(res["cuarentena"]), json.dumps(detalle, default=str)),
            )

    informe = {
        "ejecutado_en": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "lote": res["lote"],
        "segundos": round(time.time() - inicio, 2),
        "kpis_ok": ok,
        "kpis_fallo": ko,
        "filas_cuarentena": len(res["cuarentena"]),
        **detalle,
    }
    (LAGO / "_informe_pipeline.json").write_text(json.dumps(informe, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(f"\nPipeline completado en {informe['segundos']} s → {LAGO}")
    return 0 if ko == 0 and ok > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
