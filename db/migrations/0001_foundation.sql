BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug citext NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'blocked', 'closed')),
  failed_login_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'clinician', 'receptionist', 'finance', 'auditor')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE clinic_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, id)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  token_hash char(64) NOT NULL UNIQUE,
  user_agent text,
  ip_hash char(64),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, user_id) REFERENCES tenant_memberships(tenant_id, user_id)
);

CREATE INDEX sessions_user_active_idx ON sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  full_name text NOT NULL,
  preferred_name text,
  birth_date date,
  sex_at_birth text CHECK (sex_at_birth IN ('female', 'male', 'intersex', 'unknown')),
  gender_identity text,
  cpf_search_hash char(64),
  cpf_encrypted bytea,
  phone text,
  email citext,
  legal_guardian jsonb,
  address jsonb,
  insurance jsonb,
  allergies jsonb NOT NULL DEFAULT '[]'::jsonb,
  alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deceased', 'merged')),
  merged_into_patient_id uuid,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, merged_into_patient_id) REFERENCES patients(tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES tenant_memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES tenant_memberships(tenant_id, user_id)
);

CREATE INDEX patients_tenant_name_idx ON patients (tenant_id, lower(full_name));
CREATE UNIQUE INDEX patients_tenant_cpf_idx ON patients (tenant_id, cpf_search_hash) WHERE cpf_search_hash IS NOT NULL AND status <> 'merged';

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unit_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  professional_user_id uuid NOT NULL REFERENCES users(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'waiting', 'in_progress', 'completed', 'cancelled', 'no_show')),
  notes text,
  cancellation_reason text,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES clinic_units(tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id),
  FOREIGN KEY (tenant_id, professional_user_id) REFERENCES tenant_memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES tenant_memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES tenant_memberships(tenant_id, user_id)
);

ALTER TABLE appointments ADD CONSTRAINT appointments_no_professional_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    professional_user_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status NOT IN ('cancelled', 'no_show'));

CREATE INDEX appointments_tenant_period_idx ON appointments (tenant_id, starts_at, ends_at);
CREATE INDEX appointments_patient_idx ON appointments (tenant_id, patient_id, starts_at DESC);

CREATE TABLE encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unit_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  appointment_id uuid,
  professional_user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES clinic_units(tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id),
  FOREIGN KEY (tenant_id, appointment_id) REFERENCES appointments(tenant_id, id),
  FOREIGN KEY (tenant_id, professional_user_id) REFERENCES tenant_memberships(tenant_id, user_id)
);

CREATE INDEX encounters_patient_timeline_idx ON encounters (tenant_id, patient_id, started_at DESC);

CREATE TABLE clinical_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  encounter_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  author_user_id uuid NOT NULL REFERENCES users(id),
  template_key text NOT NULL DEFAULT 'general-clinical-note',
  template_version integer NOT NULL DEFAULT 1,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  content_hash char(64),
  finalized_by uuid REFERENCES users(id),
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, encounter_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters(tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id),
  FOREIGN KEY (tenant_id, author_user_id) REFERENCES tenant_memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, finalized_by) REFERENCES tenant_memberships(tenant_id, user_id)
);

CREATE TABLE clinical_note_addenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  note_id uuid NOT NULL,
  author_user_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  content jsonb NOT NULL,
  content_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, note_id) REFERENCES clinical_notes(tenant_id, id),
  FOREIGN KEY (tenant_id, author_user_id) REFERENCES tenant_memberships(tenant_id, user_id)
);

CREATE TABLE clinical_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid NOT NULL,
  encounter_id uuid,
  created_by uuid NOT NULL REFERENCES users(id),
  category text NOT NULL CHECK (category IN ('prescription', 'exam_request', 'certificate', 'report', 'image', 'attachment')),
  title text NOT NULL,
  object_key text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 char(64) NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, object_key),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id),
  FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters(tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES tenant_memberships(tenant_id, user_id)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  request_id text NOT NULL,
  ip_hash char(64),
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES tenant_memberships(tenant_id, user_id)
);

CREATE INDEX audit_tenant_time_idx ON audit_events (tenant_id, created_at DESC);
CREATE INDEX audit_resource_idx ON audit_events (tenant_id, resource_type, resource_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_tenant_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_finalized_clinical_note() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'finalized' THEN
    RAISE EXCEPTION 'finalized clinical notes are immutable; create an addendum';
  END IF;
  IF NEW.status = 'finalized' THEN
    IF NEW.finalized_by IS NULL OR NEW.finalized_at IS NULL OR NEW.content_hash IS NULL THEN
      RAISE EXCEPTION 'finalized note requires signer, timestamp and content hash';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER memberships_updated_at BEFORE UPDATE ON tenant_memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER units_updated_at BEFORE UPDATE ON clinic_units FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER patients_updated_at BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER encounters_updated_at BEFORE UPDATE ON encounters FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER notes_updated_at BEFORE UPDATE ON clinical_notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER notes_finalized_guard BEFORE UPDATE ON clinical_notes FOR EACH ROW EXECUTE FUNCTION protect_finalized_clinical_note();

CREATE TRIGGER memberships_tenant_guard BEFORE UPDATE ON tenant_memberships FOR EACH ROW EXECUTE FUNCTION prevent_tenant_change();
CREATE TRIGGER units_tenant_guard BEFORE UPDATE ON clinic_units FOR EACH ROW EXECUTE FUNCTION prevent_tenant_change();
CREATE TRIGGER patients_tenant_guard BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION prevent_tenant_change();
CREATE TRIGGER appointments_tenant_guard BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION prevent_tenant_change();
CREATE TRIGGER encounters_tenant_guard BEFORE UPDATE ON encounters FOR EACH ROW EXECUTE FUNCTION prevent_tenant_change();
CREATE TRIGGER notes_tenant_guard BEFORE UPDATE ON clinical_notes FOR EACH ROW EXECUTE FUNCTION prevent_tenant_change();

CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER addenda_append_only BEFORE UPDATE OR DELETE ON clinical_note_addenda FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_note_addenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE clinic_units FORCE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE encounters FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical_note_addenda FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_memberships ON tenant_memberships
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_units ON clinic_units
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_patients ON patients
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_appointments ON appointments
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_encounters ON encounters
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_notes ON clinical_notes
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_addenda ON clinical_note_addenda
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_documents ON clinical_documents
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_audit ON audit_events
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT USAGE ON SCHEMA public TO pep_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pep_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pep_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pep_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO pep_runtime;

COMMIT;
