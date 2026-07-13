BEGIN;

UPDATE subscription_plans SET name='Essencial', description='Para profissional autônomo ou consultório pequeno', price_monthly=99.00,
limits='{"users":2,"professionals":1,"assistants":1,"units":1,"storageGb":5}'::jsonb,
features='["agenda","onlineBooking","patients","records","icd10","icd11","documents","basicFinance"]'::jsonb WHERE code='essential';

UPDATE subscription_plans SET name='Profissional', description='Para equipes que precisam organizar atendimento e gestão', price_monthly=249.00,
limits='{"users":5,"professionals":3,"assistants":2,"units":2,"storageGb":25}'::jsonb,
features='["agenda","onlineBooking","patients","records","icd10","icd11","documents","patientPortal","preConsultation","finance","commissions","reports","waitlist","confirmations"]'::jsonb WHERE code='professional';

UPDATE subscription_plans SET name='Empresa', description='Para clínicas estruturadas, equipes maiores e redes', price_monthly=499.00,
limits='{"users":15,"professionals":10,"assistants":5,"units":5,"storageGb":100}'::jsonb,
features='["agenda","onlineBooking","patients","records","icd10","icd11","documents","patientPortal","preConsultation","finance","commissions","reports","waitlist","confirmations","multiUnit","advancedPermissions","dre","costCenters","manualReconciliation","inventory","audit","advancedReports","fhirApi","prioritySupport"]'::jsonb WHERE code='clinic';

COMMIT;
