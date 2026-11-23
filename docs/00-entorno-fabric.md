# Fase 0 — Entorno

## Herramientas locales usadas

| Herramienta | Versión |
|---|---|
| Node.js | 24.x (mínimo 20) |
| Python | 3.11 (sin PySpark ni Java: la capa Plata local usa pandas) |
| Docker | PostgreSQL 16 en el contenedor `mli-postgres`, puerto local 54330 |
| psql | No necesario (se puede usar el del contenedor) |

El contenedor y el puerto son exclusivos de este proyecto y solo escuchan en `127.0.0.1`.

## Microsoft Fabric

Lakehouse, Warehouse, notebooks, pipelines de Data Factory y Dataflow Gen2 requieren un área de trabajo asignada
a una capacidad de Fabric (F-SKU, prueba o Premium). Opciones habituales:

1. Pedir al administrador del inquilino que habilite la prueba de Fabric o asigne una capacidad.
2. Usar un inquilino propio con prueba de Fabric.
3. Crear una capacidad **F2 de pago por uso** en Azure y pausarla cuando no se use. **Genera costes**.

Las pruebas de este repositorio se hicieron con la opción 3: una capacidad F2 de desarrollo que estuvo activa
menos de una hora y quedó en pausa. El detalle de lo ejecutado está en [fabric/README.md](../fabric/README.md).

Precauciones al crear la capacidad en el portal de Azure:

- El portal puede proponer un SKU grande por defecto (F64): elegir F2 de forma explícita.
- Revisar la opción de protección de excedente para no pagar sobreconsumo.
- Pausar la capacidad al terminar (`fabric/capacidad.py pausar`).

## Configuración

Los identificadores del entorno (inquilino, área de trabajo, Lakehouse) no se versionan. Copia
`fabric/entorno.example.json` a `fabric/entorno.dev.json` y rellénalo. `fabric/capacidad.py` necesita además las
variables de entorno `AZURE_SUBSCRIPTION_ID` y `AZURE_RESOURCE_GROUP`.
