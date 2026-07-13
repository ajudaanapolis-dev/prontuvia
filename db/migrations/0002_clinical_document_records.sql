BEGIN;

CREATE TABLE clinical_document_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid NOT NULL,
  encounter_id uuid,
  author_user_id uuid NOT NULL REFERENCES users(id),
  category text NOT NULL CHECK (category IN ('prescription', 'exam_request', 'certificate', 'report', 'referral')),
  title text NOT NULL CHECK (length(title) BETWEEN 2 AND 180),
  content jsonb NOT NULL,
  content_hash char(64) NOT NULL,
  finalized_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id),
  FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters(tenant_id, id),
  FOREIGN KEY (tenant_id, author_user_id) REFERENCES tenant_memberships(tenant_id, user_id)
);

CREATE INDEX clinical_document_records_patient_idx
  ON clinical_document_records (tenant_id, patient_id, finalized_at DESC);

CREATE TRIGGER clinical_document_records_append_only
  BEFORE UPDATE OR DELETE ON clinical_document_records
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

ALTER TABLE clinical_document_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_document_records FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_clinical_document_records ON clinical_document_records
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON clinical_document_records TO pep_runtime;
REVOKE UPDATE, DELETE ON clinical_document_records FROM pep_runtime;

COMMIT;
