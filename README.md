# Prontuvia 2.2.0 — agendamento online e prontuário longitudinal

> A versão 2.2 conecta agendamento público, consentimento LGPD, gerenciamento pelo paciente, operação da recepção e resumo clínico FHIR. Consulte `docs/RELEASE_V2.2.0.md`.

> Pacientes, agenda, atendimentos, diagnósticos, documentos e proveniência agora são sincronizados automaticamente com o Medplum. Consulte `docs/RELEASE_V2.1.0.md`.

Distribuição self-hosted que combina o núcleo clínico FHIR R4 do Medplum com os módulos brasileiros do Prontuvia. O pacote inclui o aplicativo clínico reutilizado e adaptado do `medplum-provider`, console Medplum, gestão multi-clínica, agenda/portal, financeiro, repasse fixo por procedimento, TISS/glosas, NFSe por adaptador, conciliação OFX, estoque, migração CSV e filas governadas de IA/teleconsulta.

## Arquitetura 2.0

- `apps/clinical`: aplicativo clínico completo baseado no exemplo oficial Medplum Provider (Apache 2.0), com pacientes, agenda, encontros, timeline, documentos, medicações, exames, tarefas, cobertura, elegibilidade, claims, trava e adendos.
- `apps/web`: experiência brasileira Prontuvia para recepção, gestão, financeiro, comunicação, portal, TISS e glosas.
- `apps/api`: serviço de gestão multi-clínica com RLS, auditoria, integrações e ponte FHIR.
- `Medplum Server`: fonte clínica FHIR self-hosted em PostgreSQL e Redis próprios.
- `PostgreSQL Gestão`: fonte operacional para financeiro brasileiro, TISS, fiscal, estoque, billing e migração.

O código incorporado do Medplum mantém a licença Apache 2.0 em `MEDPLUM-LICENSE.txt` e `MEDPLUM-NOTICE.txt`.

Fundação local de um PEP SaaS multi-clínica. A versão 1.4 acrescenta agendamento online, portal do paciente, confirmações e lembretes, fila auditável de mensagens e adaptador para a API oficial do WhatsApp.

> Ambiente de desenvolvimento. Use somente dados fictícios até a conclusão dos controles operacionais, revisão de segurança e validação regulatória.

Base local de um prontuário eletrônico SaaS multi-clínica. O projeto começa como um monólito modular para reduzir complexidade operacional, preservando limites de domínio que permitem separar serviços no futuro.

## Estado atual

- Infraestrutura local declarada para PostgreSQL, Redis e armazenamento S3 compatível.
- Isolamento por clínica com PostgreSQL Row-Level Security.
- Sessões opacas com senha Argon2id e cookies `HttpOnly`.
- Papéis e permissões para proprietário, administrador, médico, recepção, financeiro e auditor.
- Estrutura inicial de pacientes, agenda, atendimentos, prontuários, adendos e auditoria.
- API inicial para autenticação, pacientes, agenda e prontuários.
- Edição auditada do cadastro de pacientes.
- Pesquisa CID-10 local com 12.451 subcategorias DATASUS.
- Pesquisa CID-11 por meio da API oficial da OMS e preenchimento sugerido entre CID-10/CID-11.
- Central de documentos clínicos imutáveis para receitas, atestados, laudos, exames e encaminhamentos.
- Idade exata em anos, meses e dias em todo o fluxo assistencial.
- Edição e reagendamento com prevenção de conflito e auditoria.
- Filtros por profissional e unidade para múltiplas agendas.
- Lista de espera com período, prioridade e preferências.
- Geração de documentos diretamente durante o atendimento, vinculados à consulta.
- Atestado médico e declaração como categorias independentes.
- Receitas, despesas, vencimentos, baixas, categorias, contas e resumo financeiro mensal.
- Usuários por clínica, papéis de acesso, suspensão e proteção do último proprietário.
- Criação de clínicas adicionais e troca segura de contexto na mesma conta.
- Cadastro público com escolha de plano e criação automática do ambiente.
- Planos, limites, recursos, assinatura em teste e aceite versionado dos termos.
- Identidade documental configurável para clínica ou profissional autônomo.
- Webhook Asaas autenticado e idempotente, mantido inativo até homologação.
- Menu de perfil com alteração segura da própria senha e revogação das outras sessões.
- Criação de usuários protegida por reautenticação do administrador.
- Comissões por profissional com taxa histórica, valores a receber e repasses pagos.
- Relatório financeiro por papel, período, profissional e clínica.
- Baixa de contas a pagar e receber, cancelamento de lançamentos e liquidação auditada de comissões.
- Visão consolidada de faturamento, recebido, despesas, líquido após comissões e resultado operacional.
- Página pública com planos Essencial (R$ 99), Profissional (R$ 199) e Enterprise sob consulta.
- Página pública de agendamento por clínica, respeitando escala, bloqueios e conflitos.
- Portal do paciente com acesso por código temporário, consulta e cancelamento de agendamentos.
- Confirmações imediatas e lembretes programados, recriados automaticamente ao reagendar.
- Respostas `SIM`/`CONFIRMAR` e `CANCELAR` recebidas pelo webhook atualizam a agenda.
- Central administrativa de comunicação com links públicos, modelos e histórico da fila.
- Modo sandbox local pré-configurado; nenhuma mensagem real é enviada sem credenciais.
- Aplicativo clínico FHIR do Medplum incorporado à distribuição.
- Ponte auditável para sincronizar pacientes, agendamentos e encontros com recursos `Patient`, `Appointment`, `Encounter` e `Composition`.
- Cadastro de operadoras, guias TISS, itens TUSS, validador de risco inicial, fila de glosas e recursos.
- NFSe/NF-e com sandbox local e adaptadores configuráveis para Focus NFe/eNotas.
- Conciliação bancária por importação OFX com fila de itens conciliados, ignorados ou pendentes.
- Importadores CSV para iClinic, Feegow, Amplimed, ProDoctor e formato genérico, com relatório por execução.
- Estoque com saldo, mínimo, custo médio, lotes, validade e movimentos transacionais.
- Filas governadas de IA e teleconsulta, sempre dependentes de revisão/consentimento.

Integrações bancárias, split de pagamento, boletos/CNAB, NF-e, NFS-e e faturamento TISS permanecem desativados até contratação e homologação dos respectivos provedores. A interface não apresenta esses itens como operações concluídas.

Este repositório ainda é uma fundação de desenvolvimento. Não utilize dados reais de pacientes até concluir os gates descritos em `docs/SECURITY_GATES.md`.

## Execução local

Atalho para uma instalação nova:

```bash
./scripts/setup-local.sh --bootstrap
```

Depois, inicie toda a plataforma com um único comando:

```bash
npm run dev:integrated
```

Abra somente `http://localhost:5173`. O menu **Clínico FHIR** carrega o aplicativo Medplum dentro do próprio Prontuvia. Para verificar a entrega inteira, use `./scripts/verify-local.sh`.

1. Copie `.env.example` para `.env` e substitua todos os segredos.
2. Inicie os serviços com `docker compose up -d`.
3. Instale dependências com `npm install`.
4. Execute `npm run db:migrate` com a credencial separada de migrations.
5. Execute `npm run db:bootstrap` uma única vez.
6. Inicie a API com `npm run dev`.
7. Em outro terminal, inicie o painel com `npm run dev:web` e abra `http://localhost:5173`.
8. Em outro terminal, inicie o aplicativo clínico com `npm run dev:clinical` e abra `http://localhost:5174`.

Serviços locais:

- Gestão Prontuvia: `http://localhost:5173`
- API de gestão: `http://localhost:4000`
- Prontuvia Clínico/Medplum Provider: `http://localhost:5174`
- Console administrativo Medplum: `http://localhost:3000`
- API FHIR Medplum: `http://localhost:8103/fhir/R4`

No primeiro uso do Medplum, crie o projeto da clínica no console, crie um `ClientApplication` e informe `MEDPLUM_CLIENT_ID` e `MEDPLUM_CLIENT_SECRET` no `.env`. Cada clínica comercial deve possuir seu próprio `Project` Medplum.

### Ativar a CID-11

A CID-10 funciona localmente sem configuração adicional. Para pesquisar toda a
CID-11, crie credenciais no portal oficial `https://icd.who.int/icdapi` e
preencha `WHO_ICD_CLIENT_ID` e `WHO_ICD_CLIENT_SECRET` no `.env`. Os segredos
ficam somente na API; nunca são enviados ao navegador.

A sugestão entre CID-10 e CID-11 é terminológica e deve ser revisada pelo
profissional. As classificações não possuem correspondência obrigatoriamente
unívoca.

A API responde em `http://localhost:4000`. O endpoint de saúde é `GET /health`.
O painel local possui login, visão geral, pacientes, agenda, atendimento, prontuário e histórico conectados à API.

### Comunicação, agendamento online e portal

Após executar a migração `0011`, entre como proprietário ou administrador e abra
**Comunicação** no menu lateral. O sistema já habilita o agendamento online e o
portal do paciente para novas clínicas. Os endereços seguem os formatos:

- `http://localhost:5173/agendar/identificador-da-clinica`
- `http://localhost:5173/portal/identificador-da-clinica`

Por padrão, `WHATSAPP_PROVIDER=sandbox`: confirmações, lembretes e códigos ficam
registrados na fila, sem envio externo. Para homologar o WhatsApp Cloud API,
altere o provedor para `meta`, informe o identificador do número, token, segredo
do aplicativo e token de verificação no `.env`, publique a API em HTTPS e use o
webhook mostrado na Central de Comunicação. Os três modelos configurados também
precisam estar aprovados na conta WhatsApp Business da clínica.

## Princípios obrigatórios

- Todo registro clínico pertence a um tenant.
- A API usa `pep_runtime`, sem privilégios de owner, superusuário ou `BYPASSRLS`.
- Toda consulta de domínio ocorre dentro de uma transação com contexto de tenant.
- Prontuários finalizados não são reescritos; correções são adendos.
- Eventos de auditoria são append-only.
- Integrações externas são adaptadores, nunca dependências do núcleo clínico.
