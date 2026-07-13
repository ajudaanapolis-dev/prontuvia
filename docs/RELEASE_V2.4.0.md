# Prontuvia 2.4.0 — jornada completa de agendamento

Base: Prontuvia 2.3.0.

## Paciente

- Escolha entre profissional específico ou **Qualquer profissional disponível**.
- Busca de horários de todos os profissionais habilitados para a especialidade e procedimento.
- Consulta dos próximos dias disponíveis sem testar uma data por vez.
- Link seguro para gerenciar o agendamento.
- Cancelamento com motivo e respeito ao prazo configurado pela clínica.
- Reagendamento para horários válidos do mesmo profissional.
- Reprogramação automática dos lembretes após reagendamento.

## Clínica e recepção

- Linha do tempo imutável do agendamento.
- Eventos de criação, confirmação, check-in, início, conclusão, falta,
  cancelamento e reagendamento.
- Endpoint protegido `GET /v1/appointments/:id/events`.
- Eventos distinguem ações do paciente, usuário e sistema.
- Sincronização FHIR preservada após cancelamento e reagendamento.

## Segurança e consistência

- Tokens de gestão armazenados somente como hash.
- Reagendamento valida antecedência mínima, escala, bloqueios e conflitos.
- Histórico isolado por clínica com RLS forçada.
- Vínculos de especialidade e visibilidade pública continuam obrigatórios.

## Instalação

Execute `npm run db:migrate`. A migração esperada é
`0016_booking_journey_2_4.sql`.

## Validação

- 70 testes aprovados em 23 arquivos.
- TypeScript aprovado em API, gestão e segurança.
- Build aprovado em todos os workspaces.
