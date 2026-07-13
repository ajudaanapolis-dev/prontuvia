# Prontuvia 2.2.0 — agendamento online e prontuário longitudinal

## Agendamento online

- Página pública por clínica em `/agendar/:slug`.
- Disponibilidade calculada com escalas, bloqueios, conflitos e duração do procedimento.
- Antecedência mínima configurável.
- Confirmação automática ou aprovação da recepção.
- Identificação por telefone/data de nascimento e e-mail, reduzindo duplicidades.
- Consentimento LGPD versionado e auditável.
- Link seguro para o paciente consultar e cancelar o agendamento.
- Prazo mínimo configurável para cancelamento.
- Agendamento público identificado como `Agendado online` na recepção.
- Confirmações e lembretes pela fila de comunicação existente.
- Sincronização automática do paciente e do agendamento no Medplum.

## Prontuário longitudinal FHIR

- Resumo FHIR dentro da linha do tempo do Prontuvia.
- Alergias em destaque.
- Contadores de diagnósticos, prescrições, exames e documentos.
- Identificador do Patient FHIR visível no histórico.

## Confiabilidade

- Sincronização inicial da base existente.
- Reprocessamento idempotente pela Gestão avançada.
- Fila FHIR preserva atendimento local mesmo quando a integração está indisponível.

## Atualização

Execute `npm run db:migrate` para aplicar `0014_online_booking_2_2.sql`. Preserve o `.env` da versão anterior.
