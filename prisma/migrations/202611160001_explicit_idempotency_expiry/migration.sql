-- now() для created_at и expires_at даёт одинаковое время транзакции,
-- что противоречит существующему CHECK (expires_at > created_at).
-- Сервис и seed уже задают срок явно. Существующие строки не изменяются.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE idempotency_record ALTER COLUMN expires_at DROP DEFAULT;
COMMIT;
