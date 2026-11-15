CREATE TABLE student_account (
  account_id UUID PRIMARY KEY, account_state_code TEXT NOT NULL DEFAULT 'ACTIVE',
  is_demo_account BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL, last_authenticated_at TIMESTAMPTZ,
  CONSTRAINT account_state CHECK (account_state_code IN ('ACTIVE','DISABLED'))
);
CREATE TABLE account_credential (
  credential_id UUID PRIMARY KEY, account_id UUID NOT NULL REFERENCES student_account(account_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  credential_type_code TEXT NOT NULL DEFAULT 'LOGIN_PASSWORD', login_identifier_normalized TEXT NOT NULL,
  password_hash TEXT NOT NULL, credential_state_code TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT credential_type CHECK (credential_type_code='LOGIN_PASSWORD'),
  CONSTRAINT credential_state CHECK (credential_state_code IN ('ACTIVE','DISABLED')),
  CONSTRAINT credential_login_length CHECK (char_length(login_identifier_normalized) BETWEEN 1 AND 120),
  CONSTRAINT credential_hash_type CHECK (password_hash LIKE '$argon2id$%')
);
CREATE UNIQUE INDEX account_credential_login_identifier_normalized_key ON account_credential(login_identifier_normalized);
CREATE UNIQUE INDEX account_credential_account_id_credential_type_code_key ON account_credential(account_id,credential_type_code);
CREATE TABLE auth_session (
  session_id UUID PRIMARY KEY, account_id UUID NOT NULL REFERENCES student_account(account_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  token_digest BYTEA NOT NULL, issued_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ,
  CONSTRAINT session_expiry CHECK (expires_at>issued_at),
  CONSTRAINT session_activity CHECK (last_activity_at>=issued_at),
  CONSTRAINT session_digest_length CHECK (octet_length(token_digest)=32)
);
CREATE UNIQUE INDEX auth_session_token_digest_key ON auth_session(token_digest);
CREATE INDEX auth_session_account_id_revoked_at_idx ON auth_session(account_id,revoked_at);
CREATE INDEX auth_session_expires_at_idx ON auth_session(expires_at);
CREATE TABLE auth_rate_bucket (
  key_digest BYTEA PRIMARY KEY, window_start TIMESTAMPTZ NOT NULL, failed_count INTEGER NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ, CONSTRAINT rate_count CHECK (failed_count>=0), CONSTRAINT rate_digest_length CHECK (octet_length(key_digest)=32)
);
CREATE INDEX auth_rate_bucket_window_start_idx ON auth_rate_bucket(window_start);
CREATE TABLE faculty_ref (faculty_id UUID PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE study_program_ref (
  program_id UUID PRIMARY KEY, faculty_id UUID REFERENCES faculty_ref(faculty_id) ON DELETE RESTRICT ON UPDATE CASCADE, name TEXT NOT NULL
);
CREATE TABLE academic_group_ref (
  group_id UUID PRIMARY KEY, program_id UUID REFERENCES study_program_ref(program_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  group_code TEXT NOT NULL, display_name TEXT NOT NULL
);
CREATE TABLE student_profile (
  profile_id UUID PRIMARY KEY, account_id UUID NOT NULL REFERENCES student_account(account_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  full_name TEXT NOT NULL, faculty_id UUID REFERENCES faculty_ref(faculty_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  study_program_id UUID REFERENCES study_program_ref(program_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  course_number INTEGER, academic_group_id UUID REFERENCES academic_group_ref(group_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL, CONSTRAINT positive_course CHECK (course_number IS NULL OR course_number>0)
);
CREATE UNIQUE INDEX student_profile_account_id_key ON student_profile(account_id);
CREATE TABLE student_external_identity (
  external_identity_id UUID PRIMARY KEY, account_id UUID NOT NULL REFERENCES student_account(account_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  source_code TEXT NOT NULL, external_student_id TEXT NOT NULL, valid_from DATE, valid_to DATE,
  CONSTRAINT identity_dates CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to>=valid_from)
);
CREATE UNIQUE INDEX student_external_identity_source_code_external_student_id_key ON student_external_identity(source_code,external_student_id);
CREATE UNIQUE INDEX student_external_identity_account_id_source_code_external_s_key ON student_external_identity(account_id,source_code,external_student_id);
