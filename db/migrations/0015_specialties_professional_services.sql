BEGIN;

CREATE TABLE specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
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

CREATE TABLE professional_specialties (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  professional_user_id uuid NOT NULL REFERENCES users(id),
  specialty_id uuid NOT NULL,
  council_number text,
  council_state char(2),
  rqe text,
  public_booking_enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,professional_user_id,specialty_id),
  FOREIGN KEY (tenant_id,professional_user_id) REFERENCES tenant_memberships(tenant_id,user_id),
  FOREIGN KEY (tenant_id,specialty_id) REFERENCES specialties(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id),
  FOREIGN KEY (tenant_id,updated_by) REFERENCES tenant_memberships(tenant_id,user_id),
  CHECK (council_state IS NULL OR council_state ~ '^[A-Z]{2}$')
);

CREATE TABLE professional_services (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  professional_user_id uuid NOT NULL REFERENCES users(id),
  specialty_id uuid NOT NULL,
  procedure_id uuid NOT NULL,
  public_booking_enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,professional_user_id,specialty_id,procedure_id),
  FOREIGN KEY (tenant_id,professional_user_id,specialty_id)
    REFERENCES professional_specialties(tenant_id,professional_user_id,specialty_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,procedure_id) REFERENCES procedures(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES tenant_memberships(tenant_id,user_id)
);

CREATE INDEX specialties_active_idx ON specialties(tenant_id,status,name);
CREATE INDEX professional_specialties_public_idx
  ON professional_specialties(tenant_id,specialty_id,public_booking_enabled);
CREATE INDEX professional_services_public_idx
  ON professional_services(tenant_id,specialty_id,procedure_id,public_booking_enabled);

CREATE TRIGGER specialties_updated_at BEFORE UPDATE ON specialties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER specialties_tenant_guard BEFORE UPDATE ON specialties
  FOR EACH ROW EXECUTE FUNCTION prevent_tenant_change();

ALTER TABLE specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialties FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_specialties FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_services FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_specialties ON specialties
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY tenant_isolation_professional_specialties ON professional_specialties
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY tenant_isolation_professional_services ON professional_services
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

GRANT SELECT,INSERT,UPDATE ON specialties,professional_specialties TO pep_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON professional_services TO pep_runtime;

-- Preserve the working 2.2 catalog: every active clinical professional starts
-- with a general specialty and the procedures already offered by the clinic.
INSERT INTO specialties(tenant_id,name,created_by,updated_by)
SELECT DISTINCT ON (m.tenant_id) m.tenant_id,'Clínica Geral',m.user_id,m.user_id
FROM tenant_memberships m
WHERE m.status='active' AND m.role IN('owner','admin','clinician')
ORDER BY m.tenant_id,CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
ON CONFLICT(tenant_id,name) DO NOTHING;

INSERT INTO professional_specialties(
  tenant_id,professional_user_id,specialty_id,created_by,updated_by
)
SELECT m.tenant_id,m.user_id,s.id,m.user_id,m.user_id
FROM tenant_memberships m
JOIN specialties s ON s.tenant_id=m.tenant_id AND s.name='Clínica Geral'
WHERE m.status='active' AND m.role IN('owner','admin','clinician')
ON CONFLICT DO NOTHING;

INSERT INTO professional_services(
  tenant_id,professional_user_id,specialty_id,procedure_id,created_by
)
SELECT ps.tenant_id,ps.professional_user_id,ps.specialty_id,p.id,ps.created_by
FROM professional_specialties ps
JOIN procedures p ON p.tenant_id=ps.tenant_id AND p.status='active'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION provision_trial_tenant(owner_id uuid,new_name text,new_slug text,selected_plan text,selected_entity_type text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid; main_unit_id uuid; trial_length integer; specialty_id uuid; procedure_id uuid;
BEGIN
  SELECT trial_days INTO trial_length FROM subscription_plans WHERE code=selected_plan AND status='active';
  IF trial_length IS NULL THEN RAISE EXCEPTION 'invalid plan'; END IF;
  INSERT INTO tenants(name,slug) VALUES(new_name,new_slug::citext) RETURNING id INTO new_id;
  INSERT INTO tenant_memberships(tenant_id,user_id,role,status) VALUES(new_id,owner_id,'owner','active');
  INSERT INTO clinic_units(tenant_id,name) VALUES(new_id,'Unidade principal') RETURNING id INTO main_unit_id;
  INSERT INTO tenant_profiles(tenant_id,entity_type,display_name,professional_name,updated_by) VALUES(new_id,selected_entity_type,new_name,CASE WHEN selected_entity_type='individual' THEN new_name ELSE NULL END,owner_id);
  INSERT INTO tenant_subscriptions(tenant_id,plan_code,status,trial_ends_at) VALUES(new_id,selected_plan,'trialing',now()+(trial_length||' days')::interval);
  INSERT INTO legal_acceptances(tenant_id,user_id,terms_version,privacy_version) VALUES(new_id,owner_id,'2026-07-12','2026-07-12');
  INSERT INTO procedures(tenant_id,name,duration_minutes,price,color,automatic_receivable,created_by,updated_by) VALUES(new_id,'Consulta',30,0,'#2fb99d',true,owner_id,owner_id) RETURNING id INTO procedure_id;
  INSERT INTO specialties(tenant_id,name,created_by,updated_by) VALUES(new_id,'Clínica Geral',owner_id,owner_id) RETURNING id INTO specialty_id;
  INSERT INTO professional_specialties(tenant_id,professional_user_id,specialty_id,created_by,updated_by) VALUES(new_id,owner_id,specialty_id,owner_id,owner_id);
  INSERT INTO professional_services(tenant_id,professional_user_id,specialty_id,procedure_id,created_by) VALUES(new_id,owner_id,specialty_id,procedure_id,owner_id);
  INSERT INTO tenant_communication_settings(tenant_id,updated_by) VALUES(new_id,owner_id);
  INSERT INTO professional_schedules(tenant_id,professional_user_id,unit_id,weekday,starts_at,ends_at,created_by) SELECT new_id,owner_id,main_unit_id,weekday,'08:00','18:00',owner_id FROM generate_series(1,5) AS weekday;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION provision_trial_tenant(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_trial_tenant(uuid,text,text,text,text) TO pep_runtime;

CREATE OR REPLACE FUNCTION create_tenant_for_current_owner(new_name text,new_slug text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid; actor_id uuid; main_unit_id uuid; specialty_id uuid; procedure_id uuid;
BEGIN
  actor_id := nullif(current_setting('app.user_id',true),'')::uuid;
  IF actor_id IS NULL THEN RAISE EXCEPTION 'missing app.user_id'; END IF;
  INSERT INTO tenants(name,slug) VALUES(new_name,new_slug::citext) RETURNING id INTO new_id;
  INSERT INTO tenant_memberships(tenant_id,user_id,role,status) VALUES(new_id,actor_id,'owner','active');
  INSERT INTO clinic_units(tenant_id,name) VALUES(new_id,'Unidade principal') RETURNING id INTO main_unit_id;
  INSERT INTO procedures(tenant_id,name,duration_minutes,price,color,automatic_receivable,created_by,updated_by) VALUES(new_id,'Consulta',30,0,'#2fb99d',true,actor_id,actor_id) RETURNING id INTO procedure_id;
  INSERT INTO specialties(tenant_id,name,created_by,updated_by) VALUES(new_id,'Clínica Geral',actor_id,actor_id) RETURNING id INTO specialty_id;
  INSERT INTO professional_specialties(tenant_id,professional_user_id,specialty_id,created_by,updated_by) VALUES(new_id,actor_id,specialty_id,actor_id,actor_id);
  INSERT INTO professional_services(tenant_id,professional_user_id,specialty_id,procedure_id,created_by) VALUES(new_id,actor_id,specialty_id,procedure_id,actor_id);
  INSERT INTO tenant_communication_settings(tenant_id,updated_by) VALUES(new_id,actor_id);
  INSERT INTO professional_schedules(tenant_id,professional_user_id,unit_id,weekday,starts_at,ends_at,created_by) SELECT new_id,actor_id,main_unit_id,weekday,'08:00','18:00',actor_id FROM generate_series(1,5) AS weekday;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION create_tenant_for_current_owner(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_tenant_for_current_owner(text,text) TO pep_runtime;

COMMIT;
