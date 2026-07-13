BEGIN;

CREATE TABLE appointment_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid NOT NULL,
  unit_id uuid,
  professional_user_id uuid,
  procedure_name text NOT NULL CHECK (length(procedure_name) BETWEEN 2 AND 100),
  preferred_period text NOT NULL DEFAULT 'any' CHECK (preferred_period IN ('morning', 'afternoon', 'evening', 'any')),
  preferred_days text,
  notes text CHECK (notes IS NULL OR length(notes) <= 1000),
  priority smallint NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 3),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'contacted', 'scheduled', 'cancelled')),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES clinic_units(tenant_id, id),
  FOREIGN KEY (tenant_id, professional_user_id) REFERENCES tenant_memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES tenant_memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES tenant_memberships(tenant_id, user_id)
);

CREATE INDEX appointment_waitlist_active_idx ON appointment_waitlist (tenant_id, status, priority DESC, created_at);
CREATE TRIGGER appointment_waitlist_updated_at BEFORE UPDATE ON appointment_waitlist FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER appointment_waitlist_tenant_guard BEFORE UPDATE ON appointment_waitlist FOR EACH ROW EXECUTE FUNCTION prevent_tenant_change();

ALTER TABLE appointment_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_waitlist FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_appointment_waitlist ON appointment_waitlist
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON appointment_waitlist TO pep_runtime;

COMMIT;
