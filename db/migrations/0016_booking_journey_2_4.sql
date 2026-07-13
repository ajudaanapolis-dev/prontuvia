BEGIN;

CREATE TABLE appointment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  appointment_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('created','confirmed','check_in','started','completed','no_show','cancelled','rescheduled')),
  actor_type text NOT NULL CHECK (actor_type IN ('patient','user','system')),
  actor_user_id uuid REFERENCES users(id),
  previous_starts_at timestamptz,
  new_starts_at timestamptz,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,appointment_id) REFERENCES appointments(tenant_id,id),
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES tenant_memberships(tenant_id,user_id)
);

CREATE INDEX appointment_events_timeline_idx ON appointment_events(tenant_id,appointment_id,created_at);
ALTER TABLE appointment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_appointment_events ON appointment_events
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON appointment_events TO pep_runtime;

INSERT INTO appointment_events(tenant_id,appointment_id,event_type,actor_type,new_starts_at,metadata)
SELECT tenant_id,id,'created','system',starts_at,jsonb_build_object('backfilled',true,'source',source)
FROM appointments
ON CONFLICT DO NOTHING;

COMMIT;
