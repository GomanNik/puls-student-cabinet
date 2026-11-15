#!/bin/sh
set -eu
# Только первичное создание новой БД. psql цитирует пароль как SQL literal.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=web_password="$PULS_WEB_PASSWORD" --set=ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE puls_web LOGIN PASSWORD :'web_password';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO puls_web;
ALTER DEFAULT PRIVILEGES FOR ROLE puls_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO puls_web;
ALTER DEFAULT PRIVILEGES FOR ROLE puls_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO puls_web;
SQL
