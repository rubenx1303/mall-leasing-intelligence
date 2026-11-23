# Seguridad y datos

## Aplicado en la fase 1

- **Datos ficticios** y sin datos personales: los interesados solo tienen un código y una marca inventada; no hay
  nombres de personas, documentos, teléfonos ni correos. Una prueba lo verifica.
- **Mínimo privilegio en base de datos**: la API se conecta con `mli_app`, rol de solo lectura (`SELECT`). La carga usa
  otro rol. Una prueba comprueba que `mli_app` no puede escribir.
- **API de solo lectura**: solo `GET`; validación estricta de parámetros (los desconocidos devuelven 400); errores
  internos sin detalles; CORS limitado a orígenes configurados; cabeceras `nosniff` y `no-store`.
- **Credenciales fuera del código**: `.env` ignorado por Git; `.env.example` con valores de desarrollo local.
  PostgreSQL solo escucha en `127.0.0.1`.
- **Separación de entornos**: el contenedor y el puerto (54330) son exclusivos de este proyecto; no se accede a ningún
  sistema real.

## Previsto

- Roles de aplicación (Dirección, Comercial, Finanzas) con Entra ID.
- RLS en Power BI (p. ej. un comercial ve solo sus zonas; Finanzas ve importes) y OLS para columnas sensibles.
- Separación desarrollo / producción en Fabric con áreas de trabajo distintas y pipelines de implementación.
- Documento de permisos por rol en la fase 5.
