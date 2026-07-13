# Arquitetura Prontuvia 2.0

## Decisão arquitetural

O domínio clínico passa a usar Medplum/FHIR R4 como fundação canônica. O serviço Fastify/PostgreSQL existente permanece como serviço Gestão para regras brasileiras: financeiro, repasses, TISS/glosas, fiscal, estoque, comunicação, billing e migração. Durante a transição, a ponte `/v2/medplum` sincroniza os registros validados do protótipo; novas implementações clínicas devem ser criadas diretamente como recursos FHIR.

Cada clínica corresponde a um `Project` Medplum. Unidades são `Organization`/`Location`, profissionais são `Practitioner`, agenda usa `Schedule`/`Slot`/`Appointment`, atendimentos usam `Encounter` e documentos/evoluções usam `Composition`, `DocumentReference`, `Provenance` e recursos clínicos específicos.

## Estratégia

O sistema é um monólito modular TypeScript com API Fastify e PostgreSQL. Essa forma reduz o custo de implantação inicial sem misturar os domínios. Redis e armazenamento S3 compatível são serviços auxiliares substituíveis.

## Limites de domínio

1. Identidade e acesso
2. Organizações, clínicas e unidades
3. Pacientes
4. Agenda
5. Atendimento e prontuário
6. Documentos clínicos
7. Financeiro
8. Relacionamento
9. Estoque e fiscal
10. Relatórios
11. Integrações
12. Auditoria e conformidade

## Multi-tenancy

- Um tenant representa a organização cliente do SaaS.
- Uma organização pode possuir várias unidades.
- Usuários globais se associam a tenants por memberships.
- Todas as tabelas de domínio carregam `tenant_id`.
- Row-Level Security bloqueia acesso sem contexto de tenant.
- A API define `app.tenant_id`, `app.user_id` e `app.request_id` com `SET LOCAL` em cada transação.
- Identificadores são UUIDs aleatórios e nunca sequenciais entre clientes.

## Portabilidade

- Desenvolvimento e primeira implantação: Docker Compose.
- Banco: PostgreSQL gerenciado ou em contêiner.
- Arquivos: qualquer serviço compatível com S3, incluindo MinIO local.
- Cache e filas: Redis compatível.
- A API não depende de um provedor de nuvem específico.

## Evolução

Somente extraia microsserviços após métricas demonstrarem necessidade. Processamento de documentos, notificações, faturamento TISS e integrações são os primeiros candidatos a workers independentes.
