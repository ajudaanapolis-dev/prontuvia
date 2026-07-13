BEGIN;

CREATE TABLE cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL, code text NOT NULL, status text NOT NULL DEFAULT 'active' CHECK(status IN('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,code)
);
CREATE TABLE bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL, bank_code text, agency text, account_number_masked text, opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','inactive')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE TABLE cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), operator_user_id uuid NOT NULL REFERENCES users(id),
  opened_at timestamptz NOT NULL DEFAULT now(), opening_amount numeric(14,2) NOT NULL DEFAULT 0, closed_at timestamptz,
  declared_closing_amount numeric(14,2), calculated_closing_amount numeric(14,2), status text NOT NULL DEFAULT 'open' CHECK(status IN('open','closed')),
  UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,operator_user_id) REFERENCES tenant_memberships(tenant_id,user_id)
);
CREATE TABLE budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), patient_id uuid,
  title text NOT NULL, total numeric(14,2) NOT NULL DEFAULT 0, discount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','sent','approved','rejected','expired','converted')),
  valid_until date, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id)
);
CREATE TABLE budget_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), budget_id uuid NOT NULL,
  procedure_id uuid, description text NOT NULL, quantity numeric(10,2) NOT NULL DEFAULT 1, unit_price numeric(14,2) NOT NULL,
  UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,budget_id) REFERENCES budgets(tenant_id,id) ON DELETE CASCADE, FOREIGN KEY(tenant_id,procedure_id) REFERENCES procedures(tenant_id,id)
);

CREATE TABLE tiss_operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL,
  ans_registry text NOT NULL, tiss_version text NOT NULL DEFAULT '4.01.00', submission_channel text NOT NULL DEFAULT 'file' CHECK(submission_channel IN('file','webservice','manual')),
  appeal_deadline_days integer NOT NULL DEFAULT 30 CHECK(appeal_deadline_days BETWEEN 1 AND 365), status text NOT NULL DEFAULT 'active' CHECK(status IN('active','inactive')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE(tenant_id,id), UNIQUE(tenant_id,ans_registry)
);
CREATE TABLE tiss_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), operator_id uuid NOT NULL,
  patient_id uuid, appointment_id uuid, guide_type text NOT NULL CHECK(guide_type IN('consultation','sadt','fees','hospitalization','dental','appeal')),
  guide_number text NOT NULL, beneficiary_number text, authorization_number text, total_amount numeric(14,2) NOT NULL DEFAULT 0,
  risk_score integer NOT NULL DEFAULT 0 CHECK(risk_score BETWEEN 0 AND 100), validation_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','validation','ready','awaiting_authorization','authorized','denied','batched','submitted','analyzed','paid','partially_paid','denied_total','cancelled')),
  xml_payload text, xml_sha256 text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,guide_number), FOREIGN KEY(tenant_id,operator_id) REFERENCES tiss_operators(tenant_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id), FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id)
);
CREATE TABLE tiss_guide_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), guide_id uuid NOT NULL,
  tuss_code text NOT NULL, description text NOT NULL, quantity numeric(10,2) NOT NULL DEFAULT 1, unit_price numeric(14,2) NOT NULL,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0, UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,guide_id) REFERENCES tiss_guides(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE tiss_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), operator_id uuid NOT NULL,
  batch_number text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN('open','closed','submitted','protocolled','processed','cancelled')),
  protocol text, submitted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,batch_number),
  FOREIGN KEY(tenant_id,operator_id) REFERENCES tiss_operators(tenant_id,id)
);
CREATE TABLE tiss_denials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), guide_id uuid NOT NULL,
  reason_code text NOT NULL, reason_description text NOT NULL, denied_amount numeric(14,2) NOT NULL,
  category text NOT NULL DEFAULT 'administrative' CHECK(category IN('administrative','technical','contractual','table_difference')),
  status text NOT NULL DEFAULT 'new' CHECK(status IN('new','analysis','appealed','awaiting_response','recovered','rejected','accepted_loss')),
  appeal_deadline date, assigned_user_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,guide_id) REFERENCES tiss_guides(tenant_id,id), FOREIGN KEY(tenant_id,assigned_user_id) REFERENCES tenant_memberships(tenant_id,user_id)
);
CREATE TABLE tiss_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), denial_id uuid NOT NULL,
  justification text NOT NULL, evidence jsonb NOT NULL DEFAULT '[]'::jsonb, status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','submitted','accepted','rejected','second_instance')),
  recovered_amount numeric(14,2) NOT NULL DEFAULT 0, submitted_at timestamptz, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,denial_id) REFERENCES tiss_denials(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id)
);

CREATE TABLE fiscal_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), patient_id uuid, financial_transaction_id uuid,
  kind text NOT NULL CHECK(kind IN('service','product')), provider text NOT NULL DEFAULT 'sandbox', external_id text,
  amount numeric(14,2) NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','queued','processing','authorized','rejected','cancelled')),
  rps_number text, invoice_number text, verification_code text, xml_url text, pdf_url text, error_message text,
  issued_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id), FOREIGN KEY(tenant_id,financial_transaction_id) REFERENCES financial_transactions(tenant_id,id)
);
CREATE TABLE bank_statement_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), bank_account_id uuid,
  filename text NOT NULL, file_sha256 text NOT NULL, period_start date, period_end date,
  status text NOT NULL DEFAULT 'processing' CHECK(status IN('processing','ready','reconciled','failed')), created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,file_sha256), FOREIGN KEY(tenant_id,bank_account_id) REFERENCES bank_accounts(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id)
);
CREATE TABLE bank_statement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), import_id uuid NOT NULL,
  occurred_on date NOT NULL, description text NOT NULL, amount numeric(14,2) NOT NULL, external_reference text,
  matched_transaction_id uuid, status text NOT NULL DEFAULT 'unmatched' CHECK(status IN('unmatched','matched','ignored')),
  UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,import_id) REFERENCES bank_statement_imports(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,matched_transaction_id) REFERENCES financial_transactions(tenant_id,id)
);

CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL, sku text NOT NULL,
  unit text NOT NULL DEFAULT 'un', current_quantity numeric(14,3) NOT NULL DEFAULT 0, minimum_quantity numeric(14,3) NOT NULL DEFAULT 0,
  average_cost numeric(14,4) NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'active' CHECK(status IN('active','inactive')),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,sku)
);
CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), item_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN('entry','exit','adjustment')), quantity numeric(14,3) NOT NULL, unit_cost numeric(14,4), lot text, expires_on date,
  reason text NOT NULL, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,item_id) REFERENCES inventory_items(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id)
);
CREATE TABLE migration_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), source text NOT NULL CHECK(source IN('iclinic','feegow','amplimed','prodoctor','csv','fhir')),
  filename text NOT NULL, status text NOT NULL DEFAULT 'uploaded' CHECK(status IN('uploaded','mapping','dry_run','running','completed','failed','rolled_back')),
  totals jsonb NOT NULL DEFAULT '{}'::jsonb, errors jsonb NOT NULL DEFAULT '[]'::jsonb, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id)
);
CREATE TABLE ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), patient_id uuid, encounter_id uuid,
  kind text NOT NULL CHECK(kind IN('ambient_note','summary','coding','no_show','financial_anomaly','denial_risk')),
  input_reference jsonb NOT NULL DEFAULT '{}'::jsonb, output jsonb, status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','review','approved','rejected','failed')),
  requires_human_review boolean NOT NULL DEFAULT true, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id)
);
CREATE TABLE teleconsultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), appointment_id uuid NOT NULL,
  room_key text NOT NULL, status text NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','waiting','in_progress','completed','cancelled')),
  consent_recorded_at timestamptz, recording_enabled boolean NOT NULL DEFAULT false, payment_required boolean NOT NULL DEFAULT false,
  started_at timestamptz, ended_at timestamptz, UNIQUE(tenant_id,id), UNIQUE(tenant_id,room_key), FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id)
);

CREATE INDEX tiss_guides_status_idx ON tiss_guides(tenant_id,status,created_at DESC);
CREATE INDEX tiss_denials_queue_idx ON tiss_denials(tenant_id,status,appeal_deadline);
CREATE INDEX fiscal_invoices_status_idx ON fiscal_invoices(tenant_id,status,created_at DESC);
CREATE INDEX bank_items_status_idx ON bank_statement_items(tenant_id,status,occurred_on DESC);
CREATE INDEX migration_jobs_status_idx ON migration_jobs(tenant_id,status,created_at DESC);
CREATE INDEX ai_jobs_status_idx ON ai_jobs(tenant_id,status,created_at DESC);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['cost_centers','bank_accounts','cash_sessions','budgets','budget_items','tiss_operators','tiss_guides','tiss_guide_items','tiss_batches','tiss_denials','tiss_appeals','fiscal_invoices','bank_statement_imports','bank_statement_items','inventory_items','inventory_movements','migration_jobs','ai_jobs','teleconsultations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation_%I ON %I USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',table_name,table_name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO pep_runtime',table_name);
  END LOOP;
END $$;

CREATE TRIGGER budgets_updated_at BEFORE UPDATE ON budgets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tiss_guides_updated_at BEFORE UPDATE ON tiss_guides FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tiss_denials_updated_at BEFORE UPDATE ON tiss_denials FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER migration_jobs_updated_at BEFORE UPDATE ON migration_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER ai_jobs_updated_at BEFORE UPDATE ON ai_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
