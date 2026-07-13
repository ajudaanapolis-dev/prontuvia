# Matriz integral de funcionalidades

Status possíveis: `FOUNDATION` (infraestrutura preparada), `NEXT` (próxima implementação), `PLANNED` e `EXTERNAL` (depende de fornecedor, contrato ou homologação).

## Plataforma transversal

| Capacidade | Status | Gate principal |
|---|---|---|
| SaaS multi-clínica e múltiplas unidades | FOUNDATION | Testes E2E de isolamento entre dois tenants |
| Cadastro público, planos e provisionamento automático | FOUNDATION | Homologação de e-mail e cobrança Sandbox |
| Assinaturas e limites por plano | FOUNDATION | Definir preços comerciais e validar webhooks do provedor |
| Perfis de acesso e permissões | FOUNDATION | Matriz completa papel × operação × tenant |
| Controle de senhas e sessões | FOUNDATION | MFA, recuperação, revogação e testes adversariais |
| Gestão de perfil financeiro | FOUNDATION | Separação comprovada entre dados clínicos e financeiros |
| Auditoria append-only | FOUNDATION | Auditar também leitura, exportação, impressão e negações |
| Segurança bancária | PLANNED | PSP tokenizado; nenhum cartão bruto armazenado |

## Agenda

| Funcionalidade | Status |
|---|---|
| Agenda e múltiplas agendas | FOUNDATION |
| Escala de atendimento | FOUNDATION |
| Confirmação manual | FOUNDATION |
| Consulta de disponibilidade e prevenção de conflitos | FOUNDATION |
| Gestão de compromissos | NEXT |
| Lista de espera | FOUNDATION |
| Relatórios de agendamentos | FOUNDATION |
| Agendamento online por clínica | FOUNDATION |
| Portal do paciente para consultar e cancelar | FOUNDATION |
| Confirmações e lembretes programados | FOUNDATION |
| Alteração em massa | PLANNED |
| Mural de recados | PLANNED |
| Pacotes de procedimentos | PLANNED |

## Pacientes e prontuário

| Funcionalidade | Status |
|---|---|
| Cadastro e edição auditada de pacientes | FOUNDATION |
| Prontuário eletrônico personalizável | FOUNDATION |
| Anamnese personalizada | NEXT |
| Galeria e linha do tempo de prontuários | FOUNDATION |
| Diagnóstico CID-10/CID-11 com pesquisa e sugestão cruzada | FOUNDATION |
| Prescrição básica para impressão | FOUNDATION |
| Atestado e declaração separados | FOUNDATION |
| Solicitação de exames | FOUNDATION |
| Relatório, laudo e encaminhamento básicos | FOUNDATION |
| Finalização eletrônica interna | FOUNDATION |
| Adendos sem sobrescrever o original | FOUNDATION |
| Armazenamento de imagens e documentos | FOUNDATION |
| Gráfico de pediatria | PLANNED |
| Controle de próteses | PLANNED |
| Odontograma | PLANNED |
| Avaliação odontológica | PLANNED |
| Plano de tratamento odontológico | PLANNED |
| Prescrição oftalmológica | PLANNED |
| Edição e comparação de imagens | PLANNED |
| Análise corporal e facial | PLANNED |
| Imagens antes e depois | PLANNED |
| Resposta de anamnese pelo paciente | PLANNED |
| Integração com Memed | EXTERNAL |

## Financeiro

| Funcionalidade | Status |
|---|---|
| Controle financeiro e controle de caixa | FOUNDATION |
| Contas a pagar e receber | FOUNDATION |
| Gestão de orçamentos | NEXT |
| Fluxo de caixa | FOUNDATION |
| Gestão de desconto | PLANNED |
| Relatórios financeiros | FOUNDATION |
| Contratos com pacientes | PLANNED |
| DRE | PLANNED |
| Indicadores em tempo real | PLANNED |
| Repasses e comissões a profissionais | FOUNDATION |
| Renegociação de dívidas | PLANNED |
| Conciliação bancária e cartões | EXTERNAL |
| Boletos e pagamento online | EXTERNAL |
| DMED | PLANNED |
| Faturamento TISS | EXTERNAL |

## Relacionamento e marketing

| Funcionalidade | Status |
|---|---|
| Marketing médico | PLANNED |
| E-mail personalizado | EXTERNAL |
| CSAT | PLANNED |
| Promoções e campanhas | PLANNED |
| WhatsApp Cloud API | FOUNDATION / EXTERNAL para homologação Meta |
| SMS | EXTERNAL |

## Recursos extras e integrações

| Funcionalidade | Status |
|---|---|
| Assinatura digital ICP-Brasil | EXTERNAL |
| Certificado digital | EXTERNAL |
| Telemedicina | EXTERNAL |
| Nota fiscal de serviço | EXTERNAL |
| Controle de estoque | PLANNED |
| Nota fiscal de produto | EXTERNAL |
| Business Intelligence | PLANNED |
| Gestão de planos de benefício | PLANNED |
| API pública | PLANNED |
| Painel de chamada | PLANNED |
| IA no prontuário | EXTERNAL |
| RD Station | EXTERNAL |
| Pipedrive | EXTERNAL |
| PRORADIS PACS/RIS | EXTERNAL |

Nenhum item `EXTERNAL` é considerado pronto sem sandbox, credenciais, contrato, homologação quando aplicável, webhooks idempotentes e testes de falha do fornecedor.
