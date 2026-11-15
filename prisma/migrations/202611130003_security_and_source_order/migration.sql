CREATE TABLE security_audit_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_code text NOT NULL CHECK (event_code IN ('AUTH_LOGIN_SUCCESS','AUTH_LOGIN_FAIL','AUTH_LOGIN_RATE_LIMIT','SESSION_REVOKED','SESSION_EXPIRED','ACL_DENIED','CSRF_DENIED','REQUEST_CREATED','APPEAL_CREATED','MESSAGE_CREATED','REMOTE_DELIVERY_UNCERTAIN','REMOTE_STATUS_CONFIRMED','NOTIFICATION_READ','EXPORT_DENIED','EXPORT_CREATED','ASSISTANT_BLOCKED','SOURCE_ERROR')),
  request_id varchar(80) NOT NULL,
  actor_digest bytea CHECK (actor_digest IS NULL OR octet_length(actor_digest)=32),
  target_kind text NOT NULL CHECK(target_kind IN ('SESSION','REQUEST','APPEAL','MESSAGE','NOTIFICATION','EXPORT','ASSISTANT','SOURCE','ACCESS'))
);
CREATE INDEX security_audit_event_retention_idx ON security_audit_event(occurred_at);
ALTER TABLE request_external_operation ADD COLUMN last_source_updated_at timestamptz;
