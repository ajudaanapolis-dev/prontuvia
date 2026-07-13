BEGIN;

ALTER TABLE tenant_memberships ADD COLUMN commission_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_rate BETWEEN 0 AND 100);

ALTER TABLE financial_transactions
  ADD COLUMN professional_user_id uuid REFERENCES users(id),
  ADD COLUMN commission_rate_snapshot numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_rate_snapshot BETWEEN 0 AND 100),
  ADD COLUMN commission_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  ADD COLUMN commission_status text NOT NULL DEFAULT 'not_applicable' CHECK (commission_status IN ('not_applicable','pending','paid','waived')),
  ADD COLUMN commission_paid_at timestamptz,
  ADD CONSTRAINT financial_transactions_professional_tenant_fk FOREIGN KEY (tenant_id,professional_user_id) REFERENCES tenant_memberships(tenant_id,user_id),
  ADD CONSTRAINT financial_transactions_commission_paid_check CHECK ((commission_status='paid' AND commission_paid_at IS NOT NULL) OR (commission_status<>'paid' AND commission_paid_at IS NULL));

CREATE INDEX financial_transactions_professional_idx ON financial_transactions(tenant_id,professional_user_id,due_date DESC);

UPDATE subscription_plans SET price_monthly=99.00,
 limits='{"users":2,"professionals":1,"receptionists":1,"units":1,"storageGb":5}',
 features='["agenda","patients","records","documents","cid","basicFinance"]',
 description='Para um profissional e uma secretária' WHERE code='essential';
UPDATE subscription_plans SET price_monthly=199.00,
 limits='{"users":4,"professionals":3,"receptionists":1,"units":1,"storageGb":25}',
 features='["agenda","patients","records","documents","cid","finance","commissions","waitlist","reports"]',
 description='Para até três profissionais e uma secretária' WHERE code='professional';
UPDATE subscription_plans SET price_monthly=NULL,
 limits='{"users":100,"professionals":80,"receptionists":20,"units":20,"storageGb":250}',
 features='["agenda","patients","records","documents","cid","finance","commissions","waitlist","reports","multiUnit","api","prioritySupport"]',
 description='Estrutura personalizada para clínicas e redes' WHERE code='clinic';

COMMIT;
