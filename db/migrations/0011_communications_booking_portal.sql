BEGIN;

CREATE TABLE tenant_communication_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
  online_booking_enabled boolean NOT NULL DEFAULT true,
  patient_portal_enabled boolean NOT NULL DEFAULT true,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  reminder_hours integer[] NOT NULL DEFAULT ARRAY[24],
  confirmation_template text NOT NULL DEFAULT 'prontuvia_confirmacao_consulta',
  reminder_template text NOT NULL DEFAULT 'prontuvia_lembrete_consulta',
  access_code_template text NOT NULL DEFAULT 'prontuvia_codigo_acesso',
  locale text NOT NULL DEFAULT 'pt_BR',
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,updated_by) REFERENCES tenant_memberships(tenant_id,user_id)
);

CREATE TABLE notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid,
  appointment_id uuid,
  channel text NOT NULL DEFAULT 'whatsapp' CHECK(channel IN('whatsapp','email','sandbox')),
  kind text NOT NULL CHECK(kind IN('appointment_confirmation','appointment_reminder','portal_access_code','appointment_cancelled')),
  destination text NOT NULL,
  template_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','sent','failed','cancelled','sandbox')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 20),
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id)
);

CREATE TABLE patient_portal_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid NOT NULL,
  code_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id)
);

CREATE TABLE patient_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id)
);

ALTER TABLE appointments ADD COLUMN source text NOT NULL DEFAULT 'staff' CHECK(source IN('staff','online','portal'));

CREATE INDEX notification_jobs_due_idx ON notification_jobs(tenant_id,status,scheduled_for);
CREATE INDEX portal_codes_lookup_idx ON patient_portal_access_codes(tenant_id,patient_id,expires_at DESC);
CREATE INDEX portal_sessions_token_idx ON patient_portal_sessions(token_hash) WHERE revoked_at IS NULL;
CREATE TRIGGER communication_settings_updated_at BEFORE UPDATE ON tenant_communication_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER notification_jobs_updated_at BEFORE UPDATE ON notification_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tenant_communication_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_communication_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE patient_portal_access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_portal_access_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE patient_portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_portal_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_communication_settings ON tenant_communication_settings USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY tenant_isolation_notification_jobs ON notification_jobs USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY tenant_isolation_portal_codes ON patient_portal_access_codes USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY tenant_isolation_portal_sessions ON patient_portal_sessions USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

GRANT SELECT,INSERT,UPDATE,DELETE ON tenant_communication_settings,notification_jobs,patient_portal_access_codes,patient_portal_sessions TO pep_runtime;

INSERT INTO tenant_communication_settings(tenant_id,updated_by)
SELECT membership.tenant_id,membership.user_id FROM (SELECT DISTINCT ON(tenant_id) tenant_id,user_id FROM tenant_memberships WHERE status='active' AND role IN('owner','admin') ORDER BY tenant_id,CASE role WHEN 'owner' THEN 1 ELSE 2 END) membership ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION provision_trial_tenant(owner_id uuid,new_name text,new_slug text,selected_plan text,selected_entity_type text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid; main_unit_id uuid; trial_length integer;
BEGIN
  SELECT trial_days INTO trial_length FROM subscription_plans WHERE code=selected_plan AND status='active';
  IF trial_length IS NULL THEN RAISE EXCEPTION 'invalid plan'; END IF;
  INSERT INTO tenants(name,slug) VALUES(new_name,new_slug::citext) RETURNING id INTO new_id;
  INSERT INTO tenant_memberships(tenant_id,user_id,role,status) VALUES(new_id,owner_id,'owner','active');
  INSERT INTO clinic_units(tenant_id,name) VALUES(new_id,'Unidade principal') RETURNING id INTO main_unit_id;
  INSERT INTO tenant_profiles(tenant_id,entity_type,display_name,professional_name,updated_by) VALUES(new_id,selected_entity_type,new_name,CASE WHEN selected_entity_type='individual' THEN new_name ELSE NULL END,owner_id);
  INSERT INTO tenant_subscriptions(tenant_id,plan_code,status,trial_ends_at) VALUES(new_id,selected_plan,'trialing',now()+(trial_length||' days')::interval);
  INSERT INTO legal_acceptances(tenant_id,user_id,terms_version,privacy_version) VALUES(new_id,owner_id,'2026-07-11','2026-07-11');
  INSERT INTO procedures(tenant_id,name,duration_minutes,price,color,automatic_receivable,created_by,updated_by) VALUES(new_id,'Consulta',30,0,'#2fb99d',true,owner_id,owner_id);
  INSERT INTO tenant_communication_settings(tenant_id,updated_by) VALUES(new_id,owner_id);
  INSERT INTO professional_schedules(tenant_id,professional_user_id,unit_id,weekday,starts_at,ends_at,created_by)
  SELECT new_id,owner_id,main_unit_id,weekday,'08:00','18:00',owner_id FROM generate_series(1,5) AS weekday;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION provision_trial_tenant(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_trial_tenant(uuid,text,text,text,text) TO pep_runtime;

CREATE OR REPLACE FUNCTION create_tenant_for_current_owner(new_name text, new_slug text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid; actor_id uuid; main_unit_id uuid;
BEGIN
  actor_id := nullif(current_setting('app.user_id', true), '')::uuid;
  IF actor_id IS NULL THEN RAISE EXCEPTION 'missing app.user_id'; END IF;
  INSERT INTO tenants(name,slug) VALUES(new_name,new_slug::citext) RETURNING id INTO new_id;
  INSERT INTO tenant_memberships(tenant_id,user_id,role,status) VALUES(new_id,actor_id,'owner','active');
  INSERT INTO clinic_units(tenant_id,name) VALUES(new_id,'Unidade principal') RETURNING id INTO main_unit_id;
  INSERT INTO tenant_communication_settings(tenant_id,updated_by) VALUES(new_id,actor_id);
  INSERT INTO professional_schedules(tenant_id,professional_user_id,unit_id,weekday,starts_at,ends_at,created_by)
  SELECT new_id,actor_id,main_unit_id,weekday,'08:00','18:00',actor_id FROM generate_series(1,5) AS weekday;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION create_tenant_for_current_owner(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_tenant_for_current_owner(text,text) TO pep_runtime;

COMMIT;
