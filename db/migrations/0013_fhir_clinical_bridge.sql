BEGIN;

CREATE TABLE fhir_resource_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  local_resource_type text NOT NULL,
  local_resource_id uuid NOT NULL,
  fhir_resource_type text NOT NULL,
  logical_key text NOT NULL DEFAULT 'primary',
  fhir_resource_id text NOT NULL,
  version_id text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, local_resource_type, local_resource_id, fhir_resource_type, logical_key),
  UNIQUE (tenant_id, fhir_resource_type, fhir_resource_id)
);

CREATE TABLE fhir_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  local_resource_type text NOT NULL CHECK (local_resource_type IN ('patient','appointment','encounter','document')),
  local_resource_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, local_resource_type, local_resource_id),
  FOREIGN KEY (tenant_id, requested_by) REFERENCES tenant_memberships(tenant_id, user_id)
);

CREATE INDEX fhir_sync_jobs_pending_idx
  ON fhir_sync_jobs (tenant_id, status, next_attempt_at, created_at);

ALTER TABLE fhir_resource_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE fhir_resource_links FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_fhir_resource_links ON fhir_resource_links
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE fhir_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fhir_sync_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_fhir_sync_jobs ON fhir_sync_jobs
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON fhir_resource_links, fhir_sync_jobs TO pep_runtime;

CREATE TRIGGER fhir_resource_links_updated_at BEFORE UPDATE ON fhir_resource_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER fhir_sync_jobs_updated_at BEFORE UPDATE ON fhir_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
