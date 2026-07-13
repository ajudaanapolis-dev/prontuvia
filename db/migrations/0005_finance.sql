BEGIN;

CREATE TABLE financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid,
  appointment_id uuid,
  kind text NOT NULL CHECK (kind IN ('income', 'expense')),
  description text NOT NULL CHECK (length(description) BETWEEN 2 AND 180),
  category text NOT NULL CHECK (length(category) BETWEEN 2 AND 100),
  account_name text NOT NULL DEFAULT 'Caixa principal' CHECK (length(account_name) BETWEEN 2 AND 100),
  payment_method text CHECK (payment_method IS NULL OR payment_method IN ('cash', 'pix', 'card', 'transfer', 'bank_slip', 'other')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_at timestamptz,
  notes text CHECK (notes IS NULL OR length(notes) <= 1000),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id),
  FOREIGN KEY (tenant_id, appointment_id) REFERENCES appointments(tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES tenant_memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES tenant_memberships(tenant_id, user_id),
  CHECK ((status = 'paid' AND paid_at IS NOT NULL) OR (status <> 'paid' AND paid_at IS NULL))
);

CREATE INDEX financial_transactions_period_idx ON financial_transactions (tenant_id, due_date, status);
CREATE INDEX financial_transactions_patient_idx ON financial_transactions (tenant_id, patient_id, due_date DESC);
CREATE TRIGGER financial_transactions_updated_at BEFORE UPDATE ON financial_transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER financial_transactions_tenant_guard BEFORE UPDATE ON financial_transactions FOR EACH ROW EXECUTE FUNCTION prevent_tenant_change();

ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_financial_transactions ON financial_transactions
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON financial_transactions TO pep_runtime;
REVOKE DELETE ON financial_transactions FROM pep_runtime;

COMMIT;
