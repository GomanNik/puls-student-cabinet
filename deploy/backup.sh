#!/bin/sh
set -eu

# Запускать на сервере из корня репозитория: backup.sh <env-файл> <каталог>.
# Выходной файл содержит пользовательские данные и должен покинуть сервер
# только по защищённому каналу в зашифрованное хранилище.
if [ "$#" -ne 2 ]; then
  echo 'Использование: deploy/backup.sh <защищённый env-файл> <каталог резервных копий>' >&2
  exit 2
fi
env_file=$1
backup_dir=$2
if [ ! -f "$env_file" ]; then
  echo 'Файл окружения не найден.' >&2
  exit 2
fi
umask 077
mkdir -p "$backup_dir"
target="$backup_dir/puls-$(date -u +%Y%m%dT%H%M%SZ).dump"
temporary="${target}.partial"
trap 'rm -f "$temporary"' EXIT HUP INT TERM

docker compose --env-file "$env_file" exec -T db \
  pg_dump --username puls_owner --dbname puls --format custom --no-owner --no-acl > "$temporary"
docker compose --env-file "$env_file" exec -T db pg_restore --list < "$temporary" > /dev/null
mv -- "$temporary" "$target"
sha256sum "$target" > "${target}.sha256"
echo "Создана резервная копия: $target"
