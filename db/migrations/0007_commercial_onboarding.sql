BEGIN;

CREATE TABLE subscription_plans (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  price_monthly numeric(12,2),
  trial_days integer NOT NULL DEFAULT 14 CHECK (trial_days BETWEEN 0 AND 90),
  limits jsonb NOT NULL,
  features jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','retired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO subscription_plans(code,name,description,price_monthly,trial_days,limits,features) VALUES
 ('essential','Essencial','Para profissional autônomo ou consultório inicial',NULL,14,'{"users":2,"units":1,"storageGb":5}','["agenda","patients","records","documents"]'),
 ('professional','Profissional','Para clínicas em crescimento',NULL,14,'{"users":8,"units":2,"storageGb":25}','["agenda","patients","records","documents","finance","reports"]'),
 ('clinic','Clínica','Para operação com múltiplas unidades',NULL,14,'{"users":30,"units":10,"storageGb":100}','["agenda","patients","records","documents","finance","reports","multiUnit","api"]');

CREATE TABLE tenant_profiles (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
  entity_type text NOT NULL CHECK (entity_type IN ('clinic','individual')),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 180),
  legal_name text,
  professional_name text,
  professional_registration text,
  document_header_note text,
  onboarding_status text NOT NULL DEFAULT 'pending' CHECK (onboarding_status IN ('pending','in_progress','completed')),
  onboarding_step integer NOT NULL DEFAULT 1 CHECK (onboarding_step BETWEEN 1 AND 10),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id),
  plan_code text NOT NULL REFERENCES subscription_plans(code),
  status text NOT NULL DEFAULT 'trialing' CHECK (status IN ('incomplete','trialing','active','past_due','cancelled','suspended')),
  billing_provider text NOT NULL DEFAULT 'manual' CHECK (billing_provider IN ('manual','asaas')),
  external_customer_id text, external_subscription_id text, external_checkout_id text,
  trial_ends_at timestamptz, current_period_ends_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (billing_provider, external_subscription_id)
);

CREATE TABLE billing_webhook_events (
  provider text NOT NULL, event_id text NOT NULL, event_type text NOT NULL,
  payload_hash char(64) NOT NULL, processed_at timestamptz, received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider,event_id)
);
CREATE TABLE legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES users(id),
  terms_version text NOT NULL, privacy_version text NOT NULL, accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,user_id,terms_version,privacy_version),
  FOREIGN KEY(tenant_id,user_id) REFERENCES tenant_memberships(tenant_id,user_id)
);

INSERT INTO tenant_profiles(tenant_id,entity_type,display_name,onboarding_status,onboarding_step)
  SELECT id,'clinic',name,'in_progress',1 FROM tenants ON CONFLICT DO NOTHING;
INSERT INTO tenant_subscriptions(tenant_id,plan_code,status,billing_provider,trial_ends_at)
  SELECT id,'professional','trialing','manual',now()+interval '30 days' FROM tenants ON CONFLICT DO NOTHING;

CREATE TRIGGER tenant_profiles_updated_at BEFORE UPDATE ON tenant_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tenant_subscriptions_updated_at BEFORE UPDATE ON tenant_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE tenant_profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE tenant_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY; ALTER TABLE tenant_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY; ALTER TABLE legal_acceptances FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenant_profiles ON tenant_profiles USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY tenant_isolation_tenant_subscriptions ON tenant_subscriptions USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY tenant_isolation_legal_acceptances ON legal_acceptances USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT ON subscription_plans TO pep_runtime;
GRANT SELECT,INSERT,UPDATE ON tenant_profiles,tenant_subscriptions TO pep_runtime;
GRANT SELECT ON legal_acceptances TO pep_runtime;
GRANT INSERT, SELECT ON billing_webhook_events TO pep_runtime;
REVOKE DELETE ON tenant_profiles,tenant_subscriptions FROM pep_runtime;
REVOKE ALL ON billing_webhook_events FROM pep_runtime;

CREATE OR REPLACE FUNCTION provision_trial_tenant(owner_id uuid,new_name text,new_slug text,selected_plan text,selected_entity_type text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid; trial_length integer;
BEGIN
  SELECT trial_days INTO trial_length FROM subscription_plans WHERE code=selected_plan AND status='active';
  IF trial_length IS NULL THEN RAISE EXCEPTION 'invalid plan'; END IF;
  INSERT INTO tenants(name,slug) VALUES(new_name,new_slug::citext) RETURNING id INTO new_id;
  INSERT INTO tenant_memberships(tenant_id,user_id,role,status) VALUES(new_id,owner_id,'owner','active');
  INSERT INTO clinic_units(tenant_id,name) VALUES(new_id,'Unidade principal');
  INSERT INTO tenant_profiles(tenant_id,entity_type,display_name,professional_name,updated_by)
    VALUES(new_id,selected_entity_type,new_name,CASE WHEN selected_entity_type='individual' THEN new_name ELSE NULL END,owner_id);
  INSERT INTO tenant_subscriptions(tenant_id,plan_code,status,trial_ends_at)
    VALUES(new_id,selected_plan,'trialing',now()+(trial_length||' days')::interval);
  INSERT INTO legal_acceptances(tenant_id,user_id,terms_version,privacy_version)
    VALUES(new_id,owner_id,'2026-07-11','2026-07-11');
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION provision_trial_tenant(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_trial_tenant(uuid,text,text,text,text) TO pep_runtime;

COMMIT;
