BEGIN;

CREATE OR REPLACE FUNCTION current_user_tenants()
RETURNS TABLE (tenant_id uuid, tenant_name text, tenant_slug citext, membership_role text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, t.slug, m.role
    FROM tenant_memberships m
    JOIN tenants t ON t.id = m.tenant_id
   WHERE m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
     AND m.status = 'active' AND t.status = 'active'
   ORDER BY t.name
$$;

REVOKE ALL ON FUNCTION current_user_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_user_tenants() TO pep_runtime;

CREATE OR REPLACE FUNCTION create_tenant_for_current_owner(new_name text, new_slug text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid; actor_id uuid;
BEGIN
  actor_id := nullif(current_setting('app.user_id', true), '')::uuid;
  IF actor_id IS NULL THEN RAISE EXCEPTION 'missing app.user_id'; END IF;
  INSERT INTO tenants(name, slug) VALUES (new_name, new_slug::citext) RETURNING id INTO new_id;
  INSERT INTO tenant_memberships(tenant_id,user_id,role,status) VALUES(new_id,actor_id,'owner','active');
  INSERT INTO clinic_units(tenant_id,name) VALUES(new_id,'Unidade principal');
  RETURN new_id;
END $$;

REVOKE ALL ON FUNCTION create_tenant_for_current_owner(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_tenant_for_current_owner(text, text) TO pep_runtime;

COMMIT;
