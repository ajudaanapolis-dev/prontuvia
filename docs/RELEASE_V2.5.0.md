# Prontuvia 2.5.0 — portal do paciente

Base: Prontuvia 2.4.0 validada.

## Áreas do portal

- Agenda futura e histórico de atendimentos.
- Novo agendamento e cancelamento permitido pela clínica.
- Formulário pré-consulta padrão, com respostas imutáveis.
- Documentos clínicos finalizados, autoria e hash de integridade.
- Extrato financeiro do paciente, valores pagos e pendentes.
- Atualização de contato, nome preferido e endereço.
- Cadastro e alternância segura entre titular e dependentes.

## Segurança

- Código temporário de seis dígitos com tentativas limitadas.
- Sessão HTTP-only, assinada, com expiração e revogação no logout.
- Separação entre paciente titular da conta e perfil ativo.
- Acesso a dependentes somente por vínculo explícito.
- Consultas sempre filtradas pelo paciente ativo e clínica autenticada.
- RLS forçada em dependentes, modelos e respostas.
- Respostas de formulário append-only.

## Banco

A migração `0017_patient_portal_2_5.sql` adiciona dependentes, vínculo do
titular da sessão, formulários e respostas pré-consulta. Um modelo padrão é
criado automaticamente para cada clínica existente.

## Validação

- 76 testes aprovados em 24 arquivos.
- TypeScript aprovado em API, gestão e segurança.
- Build aprovado em todos os workspaces.
