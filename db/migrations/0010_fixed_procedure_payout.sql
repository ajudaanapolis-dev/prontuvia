BEGIN;

ALTER TABLE procedures
  ADD COLUMN professional_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (professional_amount >= 0),
  ADD CONSTRAINT procedures_professional_amount_within_price CHECK (professional_amount <= price);

ALTER TABLE appointments
  ADD COLUMN professional_amount_snapshot numeric(14,2) NOT NULL DEFAULT 0 CHECK (professional_amount_snapshot >= 0),
  ADD CONSTRAINT appointments_professional_amount_within_price CHECK (professional_amount_snapshot <= price_snapshot);

COMMENT ON COLUMN procedures.professional_amount IS 'Fixed amount owed to the professional for a completed procedure';
COMMENT ON COLUMN appointments.professional_amount_snapshot IS 'Immutable professional payout captured when the appointment is created or rescheduled';

COMMIT;
