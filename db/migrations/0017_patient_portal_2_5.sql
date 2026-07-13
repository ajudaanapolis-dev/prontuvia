BEGIN;

ALTER TABLE patient_portal_sessions ADD COLUMN account_patient_id uuid;
UPDATE patient_portal_sessions SET account_patient_id=patient_id WHERE account_patient_id IS NULL;
ALTER TABLE patient_portal_sessions ALTER COLUMN account_patient_id SET NOT NULL;
ALTER TABLE patient_portal_sessions ADD CONSTRAINT portal_sessions_account_patient_fk
  FOREIGN KEY(tenant_id,account_patient_id) REFERENCES patients(tenant_id,id);

CREATE TABLE patient_dependents (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  account_patient_id uuid NOT NULL,
  dependent_patient_id uuid NOT NULL,
  relationship text NOT NULL CHECK(length(relationship) BETWEEN 2 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,account_patient_id,dependent_patient_id),
  FOREIGN KEY(tenant_id,account_patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY(tenant_id,dependent_patient_id) REFERENCES patients(tenant_id,id),
  CHECK(account_patient_id<>dependent_patient_id)
);

CREATE TABLE portal_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  title text NOT NULL CHECK(length(title) BETWEEN 2 AND 160),
  description text,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','inactive')),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,title),
  FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id),
  FOREIGN KEY(tenant_id,updated_by) REFERENCES tenant_memberships(tenant_id,user_id)
);

CREATE TABLE portal_form_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  template_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  appointment_id uuid,
  answers jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,template_id,patient_id,appointment_id),
  FOREIGN KEY(tenant_id,template_id) REFERENCES portal_form_templates(tenant_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id)
);

CREATE INDEX patient_dependents_account_idx ON patient_dependents(tenant_id,account_patient_id);
CREATE INDEX portal_form_responses_patient_idx ON portal_form_responses(tenant_id,patient_id,submitted_at DESC);
CREATE UNIQUE INDEX portal_form_responses_once_idx ON portal_form_responses(tenant_id,template_id,patient_id,coalesce(appointment_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE TRIGGER portal_form_templates_updated_at BEFORE UPDATE ON portal_form_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER portal_form_responses_append_only BEFORE UPDATE OR DELETE ON portal_form_responses FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

ALTER TABLE patient_dependents ENABLE ROW LEVEL SECURITY; ALTER TABLE patient_dependents FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_form_templates ENABLE ROW LEVEL SECURITY; ALTER TABLE portal_form_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_form_responses ENABLE ROW LEVEL SECURITY; ALTER TABLE portal_form_responses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_patient_dependents ON patient_dependents USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY tenant_isolation_portal_form_templates ON portal_form_templates USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY tenant_isolation_portal_form_responses ON portal_form_responses USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,DELETE ON patient_dependents TO pep_runtime;
GRANT SELECT,INSERT,UPDATE ON portal_form_templates TO pep_runtime;
GRANT SELECT,INSERT ON portal_form_responses TO pep_runtime;

INSERT INTO portal_form_templates(tenant_id,title,description,fields,created_by,updated_by)
SELECT DISTINCT ON(m.tenant_id) m.tenant_id,'Pré-consulta','Informações enviadas pelo paciente antes do atendimento',
  '[{"id":"complaint","label":"Motivo principal da consulta","type":"textarea","required":true},{"id":"medications","label":"Medicamentos em uso","type":"textarea","required":false},{"id":"allergies","label":"Alergias conhecidas","type":"textarea","required":false},{"id":"notes","label":"Outras informações importantes","type":"textarea","required":false}]'::jsonb,m.user_id,m.user_id
FROM tenant_memberships m WHERE m.status='active' AND m.role IN('owner','admin')
ORDER BY m.tenant_id,CASE m.role WHEN 'owner' THEN 1 ELSE 2 END
ON CONFLICT(tenant_id,title) DO NOTHING;

COMMIT;
