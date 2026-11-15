-- Журнал: запись нельзя переписать, удалить до истечения хранения или TRUNCATE.
CREATE FUNCTION protect_security_audit_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.occurred_at < now() - interval '30 days' THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'Security audit records are immutable' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER security_audit_immutable BEFORE UPDATE OR DELETE ON security_audit_event
FOR EACH ROW EXECUTE FUNCTION protect_security_audit_event();
CREATE TRIGGER security_audit_no_truncate BEFORE TRUNCATE ON security_audit_event
FOR EACH STATEMENT EXECUTE FUNCTION protect_security_audit_event();
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='puls_web') THEN
    REVOKE UPDATE, TRUNCATE ON security_audit_event FROM puls_web;
  END IF;
END $$;

CREATE INDEX appeal_owner_updated_idx ON student_appeal(owner_account_id,updated_at DESC,appeal_id);
CREATE INDEX appeal_message_latest_idx ON appeal_message(appeal_id,created_at DESC);
CREATE INDEX idempotency_account_created_idx ON idempotency_record(account_id,created_at);
CREATE INDEX request_transition_history_idx ON request_state_transition(request_id,changed_at,transition_id);
