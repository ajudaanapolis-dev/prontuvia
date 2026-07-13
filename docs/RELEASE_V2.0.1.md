# Prontuvia 2.0.1 — teste integral

- Um único comando inicia API, gestão e aplicação clínica.
- O usuário abre apenas `http://localhost:5173`.
- O menu `Clínico FHIR` incorpora a aplicação clínica Medplum ao painel Prontuvia.
- O modo expandido permite usar o prontuário clínico em tela ampla sem perder a sessão principal.
- Console Medplum e API FHIR continuam serviços internos de administração e dados.

O login Medplum é realizado uma vez no primeiro acesso ao módulo clínico. A unificação definitiva de identidade/SSO será feita pelo fluxo OAuth/OIDC de produção; o teste local preserva a separação de credenciais para não enfraquecer a segurança.
