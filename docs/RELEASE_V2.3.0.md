# Prontuvia 2.3.0 — especialidades e agenda orientada ao profissional

Base: Prontuvia 2.2.1 corrigida.

## Entregas

- Catálogo de especialidades isolado por clínica.
- Vínculo entre profissional, especialidade e procedimento.
- CRM/registro, UF e RQE por especialidade.
- Controle de visibilidade no agendamento público.
- Configuração administrativa em **Configurações → Especialidades e profissionais**.
- Fluxo público: especialidade → profissional → procedimento → unidade → data → horário.
- Procedimentos e profissionais filtrados conforme os vínculos cadastrados.
- Validação no servidor contra combinações incompatíveis ou ocultas.
- Horários calculados pela escala do profissional, unidade, duração, bloqueios,
  consultas existentes e antecedência mínima.
- Provisionamento automático de Clínica Geral e Consulta para clínicas existentes
  e novas contratações.
- Comunicação deixa de carregar indefinidamente quando a API falha e oferece
  uma ação segura de nova tentativa.

## Banco de dados

Execute obrigatoriamente:

```bash
npm run db:migrate
```

A migração `0015_specialties_professional_services.sql` cria as tabelas
`specialties`, `professional_specialties` e `professional_services`, com RLS,
chaves compostas por clínica e índices de consulta pública.

## Verificação

- TypeScript: aprovado em API, gestão e segurança.
- Testes: 65 aprovados em 22 arquivos.
- Build: aprovado em todos os workspaces.
