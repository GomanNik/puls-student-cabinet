CREATE TABLE request_type_catalog (
  request_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_kind_code text NOT NULL,
  request_type_code text NOT NULL,
  display_name text NOT NULL,
  description text ,
  form_schema_version text NOT NULL,
  is_available boolean NOT NULL DEFAULT true,
  UNIQUE(request_type_code),
  CHECK(request_kind_code IN ('APPLICATION','CERTIFICATE'))
);

CREATE TABLE student_request (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id uuid NOT NULL REFERENCES student_account(account_id) ON DELETE RESTRICT,
  request_type_id uuid NOT NULL REFERENCES request_type_catalog(request_type_id),
  form_schema_version text NOT NULL,
  submitted_data jsonb NOT NULL,
  local_state_code text NOT NULL DEFAULT 'STORED',
  business_status_code text ,
  rejection_reason text ,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(jsonb_typeof(submitted_data)='object'),
  CHECK(local_state_code='STORED'),
  CHECK(business_status_code IS NULL OR business_status_code IN ('SUBMITTED','IN_PROGRESS','READY','REJECTED'))
);

CREATE TABLE student_appeal (
  appeal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id uuid NOT NULL REFERENCES student_account(account_id) ON DELETE RESTRICT,
  category_code text NOT NULL,
  subject text NOT NULL,
  submitted_data jsonb NOT NULL DEFAULT '{}',
  local_state_code text NOT NULL DEFAULT 'STORED',
  business_status_code text NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(appeal_id,owner_account_id),
  CHECK(category_code IN ('QUESTION','PROBLEM','OTHER')),
  CHECK(business_status_code='OPEN'),
  CHECK(jsonb_typeof(submitted_data)='object')
);

CREATE TABLE appeal_message (
  message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id uuid NOT NULL REFERENCES student_appeal(appeal_id),
  sender_kind_code text NOT NULL,
  sender_account_id uuid REFERENCES student_account(account_id),
  external_sender_ref text ,
  sequence_number bigint NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  source_created_at timestamptz ,
  external_message_id text ,
  source_code text ,
  UNIQUE(appeal_id,sequence_number),
  UNIQUE(source_code,external_message_id),
  FOREIGN KEY(appeal_id,sender_account_id) REFERENCES student_appeal(appeal_id,owner_account_id),
  CHECK(length(btrim(body)) BETWEEN 1 AND 4000 AND sequence_number>0),
  CHECK((sender_kind_code='STUDENT' AND sender_account_id IS NOT NULL AND external_sender_ref IS NULL AND source_code IS NULL) OR (sender_kind_code='EXTERNAL_PARTY' AND sender_account_id IS NULL AND external_sender_ref IS NOT NULL AND source_code IS NOT NULL AND external_message_id IS NOT NULL))
);

CREATE TABLE request_external_operation (
  operation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES student_request(request_id),
  source_code text NOT NULL,
  operation_kind_code text NOT NULL,
  external_operation_id text ,
  correlation_id text NOT NULL,
  external_state_code text NOT NULL DEFAULT 'PENDING',
  started_at timestamptz ,
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz ,
  last_error_code text ,
  last_error_summary text ,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  next_poll_at timestamptz ,
  last_seen_source_revision text ,
  lease_until timestamptz ,
  lease_token uuid ,
  UNIQUE(request_id,source_code,operation_kind_code),
  UNIQUE(source_code,external_operation_id)
);

CREATE TABLE request_external_attempt (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES request_external_operation(operation_id),
  attempt_number integer NOT NULL CHECK(attempt_number>0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz ,
  outcome_code text NOT NULL,
  error_code text ,
  safe_error_summary text ,
  UNIQUE(operation_id,attempt_number)
);

CREATE TABLE appeal_external_operation (
  operation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id uuid NOT NULL REFERENCES student_appeal(appeal_id),
  source_code text NOT NULL,
  operation_kind_code text NOT NULL,
  external_operation_id text ,
  external_appeal_id text ,
  reply_cursor text ,
  correlation_id text NOT NULL,
  external_state_code text NOT NULL DEFAULT 'PENDING',
  started_at timestamptz ,
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz ,
  last_error_code text ,
  last_error_summary text ,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  next_poll_at timestamptz ,
  last_seen_source_revision text ,
  lease_until timestamptz ,
  lease_token uuid ,
  UNIQUE(appeal_id,source_code,operation_kind_code),
  UNIQUE(source_code,external_operation_id),
  UNIQUE(source_code,external_appeal_id)
);

CREATE TABLE appeal_external_attempt (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES appeal_external_operation(operation_id),
  attempt_number integer NOT NULL CHECK(attempt_number>0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz ,
  outcome_code text NOT NULL,
  error_code text ,
  safe_error_summary text ,
  UNIQUE(operation_id,attempt_number)
);

CREATE TABLE request_state_transition (
  transition_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES student_request(request_id),
  state_dimension_code text NOT NULL,
  from_state_code text ,
  to_state_code text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  change_source_code text NOT NULL,
  reason_code text ,
  event_occurrence_key text NOT NULL,
  UNIQUE(request_id,state_dimension_code,event_occurrence_key)
);

CREATE TABLE message_delivery_operation (
  delivery_operation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES appeal_message(message_id),
  source_code text NOT NULL,
  remote_idempotency_key text NOT NULL,
  delivery_state_code text NOT NULL DEFAULT 'PENDING',
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz ,
  lease_token uuid ,
  external_message_id text ,
  last_error_code text ,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id,source_code),
  UNIQUE(source_code,remote_idempotency_key),
  UNIQUE(source_code,external_message_id)
);

CREATE TABLE message_delivery_attempt (
  delivery_attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  source_code text NOT NULL,
  attempt_number integer NOT NULL CHECK(attempt_number>0),
  delivery_state_code text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz ,
  external_message_id text ,
  error_code text ,
  safe_error_summary text ,
  FOREIGN KEY(message_id,source_code) REFERENCES message_delivery_operation(message_id,source_code),
  UNIQUE(message_id,source_code,attempt_number)
);

CREATE TABLE student_notification_state (
  account_id uuid NOT NULL REFERENCES student_account(account_id),
  source_kind_code text NOT NULL,
  source_ref text NOT NULL,
  category_code text NOT NULL,
  event_occurrence_key text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,source_kind_code,source_ref,category_code,event_occurrence_key)
);

CREATE TABLE idempotency_record (
  idempotency_record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES student_account(account_id),
  operation_scope_code text NOT NULL,
  key_digest bytea NOT NULL,
  request_hash bytea NOT NULL,
  result_kind text NOT NULL,
  result_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id,operation_scope_code,key_digest)
);

INSERT INTO request_type_catalog(request_kind_code,request_type_code,display_name,description,form_schema_version) VALUES ('CERTIFICATE','DEMO_CERTIFICATE','Справка об обучении (демо)','Демонстрационная форма. Не является официальной справкой.','v1'),('APPLICATION','DEMO_APPLICATION','Общее заявление (демо)','Демонстрационная форма без юридических последствий.','v1');

CREATE INDEX request_owner_idx ON student_request(owner_account_id,created_at DESC,request_id); CREATE INDEX request_runner_idx ON request_external_operation(next_attempt_at,next_poll_at) WHERE external_state_code <> 'PERMANENT_TECHNICAL_ERROR';

CREATE INDEX appeal_owner_idx ON student_appeal(owner_account_id,created_at DESC,appeal_id); CREATE INDEX appeal_runner_idx ON appeal_external_operation(next_attempt_at,next_poll_at) WHERE external_state_code <> 'PERMANENT_TECHNICAL_ERROR';

CREATE INDEX message_delivery_due_idx ON message_delivery_operation(next_attempt_at); CREATE INDEX notification_account_idx ON student_notification_state(account_id,read_at DESC); CREATE INDEX idempotency_expiry_idx ON idempotency_record(expires_at);

ALTER TABLE request_external_operation ADD CONSTRAINT request_external_state_ck CHECK(external_state_code IN ('PENDING','SENDING','ACKNOWLEDGED','UNKNOWN','RETRYABLE_ERROR','PERMANENT_TECHNICAL_ERROR'));

ALTER TABLE appeal_external_operation ADD CONSTRAINT appeal_external_state_ck CHECK(external_state_code IN ('PENDING','SENDING','ACKNOWLEDGED','UNKNOWN','RETRYABLE_ERROR','PERMANENT_TECHNICAL_ERROR'));
ALTER TABLE message_delivery_operation ADD CONSTRAINT message_delivery_state_ck CHECK(delivery_state_code IN ('PENDING','SENDING','ACKNOWLEDGED','UNKNOWN','RETRYABLE_ERROR','PERMANENT_TECHNICAL_ERROR'));
ALTER TABLE idempotency_record ADD CONSTRAINT idempotency_expiry_ck CHECK(expires_at>created_at);
ALTER TABLE student_notification_state ADD CONSTRAINT notification_category_ck CHECK(category_code IN ('ANNOUNCEMENT','ACADEMIC_DEADLINE','SCHEDULE_CHANGE','APPEAL_REPLY','REQUEST_STATUS'));
