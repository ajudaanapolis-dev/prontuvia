BEGIN;

CREATE TABLE procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 720),
  price numeric(14,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  color char(7) NOT NULL DEFAULT '#2fb99d' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  tuss_code text CHECK (tuss_code IS NULL OR length(tuss_code) <= 20),
  automatic_receivable boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,name),
  FOREIGN KEY (tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id),
  FOREIGN KEY (tenant_id,updated_by) REFERENCES tenant_memberships(tenant_id,user_id)
);

CREATE TABLE professional_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  professional_user_id uuid NOT NULL REFERENCES users(id),
  unit_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,professional_user_id) REFERENCES tenant_memberships(tenant_id,user_id),
  FOREIGN KEY (tenant_id,unit_id) REFERENCES clinic_units(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id),
  CHECK (ends_at > starts_at)
);

CREATE TABLE schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  professional_user_id uuid NOT NULL REFERENCES users(id),
  unit_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 2 AND 180),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,professional_user_id) REFERENCES tenant_memberships(tenant_id,user_id),
  FOREIGN KEY (tenant_id,unit_id) REFERENCES clinic_units(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id),
  CHECK (ends_at > starts_at)
);

ALTER TABLE appointments
  ADD COLUMN procedure_id uuid,
  ADD COLUMN price_snapshot numeric(14,2) NOT NULL DEFAULT 0 CHECK (price_snapshot >= 0),
  ADD CONSTRAINT appointments_procedure_tenant_fk FOREIGN KEY (tenant_id,procedure_id) REFERENCES procedures(tenant_id,id);

CREATE INDEX professional_schedules_lookup_idx ON professional_schedules(tenant_id,professional_user_id,weekday,status);
CREATE INDEX schedule_blocks_lookup_idx ON schedule_blocks(tenant_id,professional_user_id,starts_at,ends_at);
CREATE INDEX procedures_active_idx ON procedures(tenant_id,status,name);
CREATE UNIQUE INDEX financial_transactions_appointment_income_unique
  ON financial_transactions(tenant_id,appointment_id)
  WHERE kind='income' AND appointment_id IS NOT NULL AND status<>'cancelled';

CREATE TRIGGER procedures_updated_at BEFORE UPDATE ON procedures FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER procedures_tenant_guard BEFORE UPDATE ON procedures FOR EACH ROW EXECUTE FUNCTION prevent_tenant_change();

ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedures FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_blocks FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_procedures ON procedures
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY tenant_isolation_professional_schedules ON professional_schedules
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY tenant_isolation_schedule_blocks ON schedule_blocks
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

GRANT SELECT,INSERT,UPDATE ON procedures TO pep_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON professional_schedules TO pep_runtime;
GRANT SELECT,INSERT,DELETE ON schedule_blocks TO pep_runtime;

INSERT INTO procedures(tenant_id,name,duration_minutes,price,color,automatic_receivable,created_by,updated_by)
SELECT membership.tenant_id,'Consulta',30,0,'#2fb99d',true,membership.user_id,membership.user_id
FROM (SELECT DISTINCT ON (tenant_id) tenant_id,user_id FROM tenant_memberships WHERE status='active' AND role IN('owner','admin') ORDER BY tenant_id,CASE role WHEN 'owner' THEN 1 ELSE 2 END) membership
ON CONFLICT(tenant_id,name) DO NOTHING;

CREATE OR REPLACE FUNCTION provision_trial_tenant(owner_id uuid,new_name text,new_slug text,selected_plan text,selected_entity_type text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid; trial_length integer;
BEGIN
  SELECT trial_days INTO trial_length FROM subscription_plans WHERE code=selected_plan AND status='active';
  IF trial_length IS NULL THEN RAISE EXCEPTION 'invalid plan'; END IF;
  INSERT INTO tenants(name,slug) VALUES(new_name,new_slug::citext) RETURNING id INTO new_id;
  INSERT INTO tenant_memberships(tenant_id,user_id,role,status) VALUES(new_id,owner_id,'owner','active');
  INSERT INTO clinic_units(tenant_id,name) VALUES(new_id,'Unidade principal');
  INSERT INTO tenant_profiles(tenant_id,entity_type,display_name,professional_name,updated_by) VALUES(new_id,selected_entity_type,new_name,CASE WHEN selected_entity_type='individual' THEN new_name ELSE NULL END,owner_id);
  INSERT INTO tenant_subscriptions(tenant_id,plan_code,status,trial_ends_at) VALUES(new_id,selected_plan,'trialing',now()+(trial_length||' days')::interval);
  INSERT INTO legal_acceptances(tenant_id,user_id,terms_version,privacy_version) VALUES(new_id,owner_id,'2026-07-11','2026-07-11');
  INSERT INTO procedures(tenant_id,name,duration_minutes,price,color,automatic_receivable,created_by,updated_by) VALUES(new_id,'Consulta',30,0,'#2fb99d',true,owner_id,owner_id);
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION provision_trial_tenant(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_trial_tenant(uuid,text,text,text,text) TO pep_runtime;

COMMIT;
