-- Se ejecuta una sola vez al crear el contenedor de DESARROLLO.
-- Rol de aplicación con permisos de SOLO LECTURA: la API nunca escribe en la base.
CREATE ROLE mli_app LOGIN PASSWORD 'mli_app_dev';
CREATE SCHEMA IF NOT EXISTS comercial AUTHORIZATION mli_owner;
GRANT USAGE ON SCHEMA comercial TO mli_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mli_owner IN SCHEMA comercial GRANT SELECT ON TABLES TO mli_app;
