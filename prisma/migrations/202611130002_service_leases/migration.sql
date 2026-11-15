CREATE TABLE service_concurrency_lease (
  lease_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES student_account(account_id) ON DELETE RESTRICT,
  scope_code text NOT NULL,
  expires_at timestamptz NOT NULL,
  UNIQUE(account_id,scope_code)
);
CREATE INDEX service_lease_expiry_idx ON service_concurrency_lease(expires_at);
