BEGIN;

ALTER TABLE tenant_communication_settings
  ADD COLUMN booking_auto_confirm boolean NOT NULL DEFAULT true,
  ADD COLUMN minimum_booking_notice_hours integer NOT NULL DEFAULT 2 CHECK (minimum_booking_notice_hours BETWEEN 0 AND 720),
  ADD COLUMN cancellation_notice_hours integer NOT NULL DEFAULT 4 CHECK (cancellation_notice_hours BETWEEN 0 AND 720),
  ADD COLUMN require_birth_date boolean NOT NULL DEFAULT true,
  ADD COLUMN booking_terms text NOT NULL DEFAULT 'Ao agendar, declaro que os dados informados são verdadeiros e autorizo seu uso para prestação do atendimento e comunicações relacionadas, conforme a LGPD.';

CREATE TABLE online_booking_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  terms_version text NOT NULL,
  terms_text text NOT NULL,
  ip_hash char(64),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, appointment_id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id),
  FOREIGN KEY (tenant_id, appointment_id) REFERENCES appointments(tenant_id, id)
);

CREATE TABLE online_booking_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  appointment_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, appointment_id),
  FOREIGN KEY (tenant_id, appointment_id) REFERENCES appointments(tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id)
);

ALTER TABLE online_booking_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_booking_consents FORCE ROW LEVEL SECURITY;
ALTER TABLE online_booking_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_booking_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_online_booking_consents ON online_booking_consents
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY tenant_isolation_online_booking_tokens ON online_booking_tokens
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

GRANT SELECT,INSERT,UPDATE,DELETE ON online_booking_consents,online_booking_tokens TO pep_runtime;
CREATE INDEX online_booking_tokens_lookup_idx ON online_booking_tokens(token_hash) WHERE revoked_at IS NULL;

COMMIT;
