BEGIN;

ALTER TABLE clinical_document_records
  DROP CONSTRAINT clinical_document_records_category_check;

ALTER TABLE clinical_document_records
  ADD CONSTRAINT clinical_document_records_category_check
  CHECK (category IN ('prescription', 'exam_request', 'certificate', 'declaration', 'report', 'referral'));

COMMIT;
