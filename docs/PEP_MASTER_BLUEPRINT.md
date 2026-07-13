# PEP MASTER BLUEPRINT — Projeto de Implementação Estrutural
### Prontuário Eletrônico + Gestão de Clínicas · Documento unificado e definitivo · v2.1
**Fundação: Medplum (FHIR R4, self-hosted, Apache 2.0) · TypeScript ponta a ponta · Produto proprietário**

> Este documento unifica e substitui `ARQUITETURA_PEP.md` v1 e `TISS_GESTAO_GLOSAS.md` v1, incorporando análise competitiva de mercado (iClinic/Afya, Feegow, Amplimed/RD, ProDoctor, Shosp, HiDoctor, GestãoDS, Doctoralia, **Clínica nas Nuvens, Ninsaúde, iMedicina**) e o estado da arte internacional 2026 (Epic AI Charting, Abridge, Ambience, **Jane App, SimplePractice, Cliniko**, Medplum, Ottehr, OpenEMR).

---

# PARTE I — TESE E ESTRATÉGIA

## 1. Tese do produto

O mercado brasileiro de software médico é grande, maduro em marketing e **medíocre em engenharia**. Todos os líderes oferecem o mesmo trio (agenda + prontuário + financeiro raso) com modelos de dados proprietários, TISS tratado como gerador de guias e IA cosmética. As dores não resolvidas por ninguém:

1. **Glosas** — clínicas perdem 5–15% do faturamento de convênio e gerenciam isso em planilha.
2. **Documentação** — o médico digita durante a consulta; "pajama time" existe no Brasil também.
3. **Financeiro gerencial** — nenhum líder entrega DRE real, conciliação bancária séria e rentabilidade por convênio.
4. **Dados aprisionados** — modelos proprietários; migrar de sistema é traumático (e eles contam com isso).
5. **Fluidez** — sistemas lentos, cheios de cliques, feitos para o gestor comprar, não para o médico usar.

**Nossa tese: construir o único PEP brasileiro que é (a) FHIR-nativo — dados no padrão internacional que a RNDS adota, (b) IA-nativo — a IA está no loop de eventos, não pendurada na interface, e (c) obcecado por dois números: minutos economizados por consulta e reais recuperados de glosa.** Tudo o mais é consequência.

## 2. Matriz de absorção competitiva
O que cada concorrente tem de melhor — e como nós superamos:

| Concorrente | Melhor recurso deles | Nossa versão superior |
|---|---|---|
| iClinic | UX simples, marketing médico, ecossistema Afya (RX/Pay) | Mesma simplicidade com metade dos cliques (metas de performance §22); marketing com automações por coorte clínica |
| Feegow | Amplitude (200+ funções), certificação SBIS, agendas de salas/equipamentos, filas | Mesma amplitude com arquitetura modular (não monólito); SBIS no roadmap (§21); recursos = `Location`/`Device` FHIR nativos |
| Amplimed | Teleconsulta dentro do prontuário sem app, prontuário em tela única, pagamento online na teleconsulta, rede com operadoras | Igual + gravação com consentimento anexada ao encontro + IA ambiente na teleconsulta; rede antiglosa multi-tenant (efeito de rede que eles não têm) |
| ProDoctor | Documentos com QR Code de validação, agenda de salas/equipamentos, repasse automatizado | QR de validação em TODO documento assinado (padrão ITI) + verificador público |
| Shosp | Multi-unidade real, editor de imagens no prontuário, conciliação bancária, NFS-e | Multi-unidade por design (tenant → unidades); editor de imagem com anotação sobre exames e mapa corporal vetorial |
| HiDoctor | **Offline** (único do mercado) | Offline-first no mobile e PWA: agenda+ficha+evolução em cache com sync CRDT (§16) — ninguém em nuvem tem isso |
| GestãoDS | Suporte humano < 60s | Suporte in-app com contexto da tela + IA de suporte treinada na nossa doc + humano < 60s no plano Pro |
| Doctoralia | Marketplace de pacientes | Integração com marketplaces (Doctoralia/Google Reserve) em vez de competir com eles; nosso agendamento online é white-label da clínica |
| Clínica nas Nuvens | Odontograma, gráfico pediátrico, **editor de imagem antes/depois** (estética/plástica), gestão de planos próprios | Comparador antes/depois com régua/sobreposição no prontuário; **planos de assinatura da clínica** (receita recorrente B2C) no financeiro |
| Ninsaúde | **CRM/funil de captação de pacientes**, API aberta, multi-idioma, gestão de franquias/redes | Funil de leads→primeira consulta integrado ao marketing e ao BI (CAC por canal); multi-unidade já nativo |
| Jane App (CA) | **Staff administrativo não paga licença**; licença part-time; lista de espera com auto-inscrição do paciente; onboarding 1:1 + academia | Mesmos três como armas de pricing/GTM (§20/§32); paciente entra sozinho na lista de espera e recebe oferta de vaga por WhatsApp |
| SimplePractice (US) | Lembrete de **evolução pendente** ("você não finalizou a nota da sessão X"); pre-session insights | Alertas de documentação pendente no dashboard do profissional + resumo pré-consulta por IA (já em §7/§18) |
| Epic/Abridge/Ambience (EUA) | Ambient AI com evidência vinculada; ordens sugeridas pela conversa; codificação automática | **Escriba ambiente em pt-BR com evidência vinculada** (cada frase da nota clica para o áudio/transcrição de origem) + sugestão de CID/TUSS + pedidos e prescrição pré-montados a partir da conversa (§10) |

## 3. Princípios inegociáveis
1. **FHIR R4 é o modelo canônico.** Zero tabela clínica proprietária. Extensões BR publicadas como ImplementationGuide.
2. **Event-driven.** Toda ação relevante emite evento; automações (Bots) consomem eventos. Nada de polling, nada de "rodar relatório para descobrir".
3. **IA no loop, humano no comando.** IA redige, sugere, prevê; humano revisa e assina. Toda saída de IA é marcada, auditável e rastreável à evidência.
4. **Auditoria e LGPD por design.** `AuditEvent` para todo acesso; logs append-only com hash encadeado; consentimento como recurso de primeira classe.
5. **Performance é funcionalidade.** Orçamentos de latência com teste automatizado (§22). Um sistema lento é um sistema errado.
6. **Cada clique conta.** Fluxos medidos em cliques e segundos; meta pública por fluxo (ex.: "receita renovada em ≤ 3 cliques").
7. **Dados do cliente são do cliente.** Exportação completa (FHIR bulk + CSV) em 1 clique, sempre. Confiança como arma comercial contra o lock-in dos concorrentes.

---

# PARTE II — ARQUITETURA

## 4. Stack tecnológica

| Camada | Tecnologia | Papel |
|---|---|---|
| Datastore clínico | **Medplum Server** + PostgreSQL 16 | FHIR R4 nativo: CRUD, busca, histórico, transações, compartments, Subscriptions |
| Serviço Gestão | **NestJS** (TS) + PostgreSQL | Financeiro BR, TISS/glosas, NFS-e, estoque, marketing, billing SaaS |
| Serviço IA | **Python (FastAPI)** + fila | Escriba ambiente (ASR Whisper + LLM), sumarização, codificação, predições |
| Eventos | Redis + BullMQ (outbox pattern) | Bots, SLA timers, integrações idempotentes |
| Frontend | React 18 + Vite + TanStack Query + Mantine (base Medplum UI) + design system próprio | App Profissional, App Clínica |
| Mobile | React Native (Expo) + SQLite local | **Offline-first**: agenda, fichas, evolução com sync |
| Portal paciente | Next.js (SSR/SEO) | Agendamento 24h, teleconsulta, documentos |
| Teleconsulta | LiveKit self-hosted (WebRTC SFU) | Vídeo no prontuário, gravação, tela compartilhada, sem app |
| PDF/Docs | Puppeteer service + templates | Receitas, laudos, guias TISS espelho, recibos |
| Assinatura | ICP-Brasil A1/A3 + PSC em nuvem (BirdID/VIDaaS) + carimbo do tempo | Validade jurídica CFM/ITI, QR de validação |
| Mensageria | WhatsApp Business Cloud API · SMS · e-mail (SES) · push | Confirmações, campanhas, inbox da recepção |
| Prescrição | Memed API + receituário próprio (base ANVISA fallback) | Bulário, interações, controle especial |
| Binários | S3/MinIO criptografado | Anexos, exames, áudio de consultas (opt-in), XMLs TISS |
| Infra | Docker → Kubernetes · Terraform · GitHub Actions | Multi-ambiente, IaC |
| Observabilidade | OpenTelemetry + Grafana stack + Sentry | Traces por fluxo de usuário; orçamentos de latência como alertas |

**Multi-tenancy:** `Project` Medplum por clínica; unidades = `Organization/Location` filhas. Enterprise: banco dedicado opcional. Chaves, políticas e credenciais isoladas por tenant.

## 5. Topologia de serviços
```
[Web Prof.] [Web Clínica] [Portal Paciente] [Mobile offline-first]
      └───────────────┬───────────────────────────┘
                API Gateway (auth, rate-limit, tenant routing)
        ┌─────────────┼──────────────────┐
        ▼             ▼                  ▼
  Medplum (FHIR)   Gestão (NestJS)    IA (FastAPI)
  clínico·agenda   financeiro·TISS    escriba·codificação
  docs·auth·audit  NFS-e·estoque      predições·sumários
        │   Subscriptions → outbox → BullMQ ← eventos ←┘
        ▼             ▼
   Postgres+S3    Postgres Gestão
        ▼
  Workers: PDF · assinatura · WhatsApp · LiveKit · conciliação · ETL analytics
```
IDs FHIR são a chave estrangeira universal. Gestão espelha fatos financeiros em recursos FHIR (`Invoice`, `Claim`...) para interoperabilidade; a fonte operacional do faturamento é o relacional (§14).

## 6. Mapa completo de módulos
```
PROFISSIONAL                     CLÍNICA
 1 Prontuário                     9 Agenda & Recepção (salas/equip.)
 2 Atendimento & fila viva       10 Cadastro & CRM de pacientes
 3 Escriba IA (ambiente)         11 Financeiro (núcleo)
 4 Prescrição digital            12 TISS & Glosas (Parte IV)
 5 Documentos & assinatura       13 Estoque & insumos
 6 Teleconsulta                  14 Relatórios & BI + coortes
 7 Ferramentas clínicas          15 Comunicação & Marketing
 8 Timeline & resultados         16 Equipe, permissões, multi-unidade
                                 17 Configurações
PACIENTE                         PLATAFORMA
18 Agendamento online 24h        22 Auth/SSO/MFA
19 Confirmação & check-in        23 Auditoria & LGPD
20 Teleconsulta & documentos     24 Motor de eventos (Bots)
21 App do paciente (fase 3)      25 Notificações unificadas
                                 26 Migração de dados (arma comercial)
                                 27 API pública & integrações
                                 28 Billing SaaS & feature flags
```

---

# PARTE III — ESPECIFICAÇÃO DOS MÓDULOS

## 7. Prontuário Eletrônico
**FHIR:** Patient, Encounter, Observation, Condition, AllergyIntolerance, Procedure, Immunization, FamilyMemberHistory, ClinicalImpression, CarePlan, Flag, Questionnaire/Response, DocumentReference.

- **Tela única** (lição Amplimed): resumo do paciente, alertas (alergias, condições ativas, últimos diagnósticos), evolução atual e histórico na mesma vista, sem trocar de página. Painéis colapsáveis, layout salvo por profissional.
- **Editor de seções por especialidade** (motor `Questionnaire` + renderer próprio): texto rico, numérico com unidade (vira série temporal automática), seleção, escala, tabela, desenho vetorial sobre imagem (mapa corporal, odontograma, olho, coluna) e **anotação sobre exames anexados** (lição Shosp, superada: camadas vetoriais não-destrutivas) e **comparador antes/depois** de fotos clínicas com sobreposição, régua e linha do tempo (lição Clínica nas Nuvens — estética, dermato, plástica, feridas, evolução postural).
- Templates prontos: clínica geral, pediatria, **neuropediatria** (marcos de desenvolvimento, escalas M-CHAT/SNAP-IV/Denver II com scoring automático), GO, orto, derma, psiquiatria, odonto, nutrição, fisio/fono/TO (sessões).
- Histórico evolutivo: qualquer numérico plota tabela/gráfico; curvas de crescimento OMS/Intergrowth com plot automático de peso/estatura/PC e alerta de desvio de canal.
- **Imutabilidade CFM**: encontro finalizado é selado (versão FHIR); adendos versionados; trilha completa.
- Compartilhamento granular (AccessPolicy): por paciente↔profissional ou clínica; "quebra-vidro" com justificativa auditada para emergências.
- Carteira de vacinação PNI + privada com status por idade.
- Busca full-text no histórico; filtros por tipo/período/profissional.
- **Sumário de IA ao abrir** (opt-in): "última consulta há 4 meses; em uso de X; pendente laudo Y" — com fontes clicáveis (§10).

## 8. Atendimento & Fila Viva
- Início pela agenda, "pacientes do dia" ou ficha; **cronômetro**; autosave contínuo + snapshot no fechamento.
- **Fila viva** (Subscriptions/websocket): agendado→confirmado→chegou→triagem→em atendimento→finalizado→faltou. Recepção, painel de TV da sala de espera (opcional, com chamada por senha/nome social) e profissional veem o mesmo estado em tempo real. Filas por sala/equipamento (lição Feegow/ProDoctor).
- Encerramento dispara efeitos automáticos (Bots): receita financeira, NPS, sugestão de retorno, baixa de insumos por ficha técnica.
- **Alertas de documentação pendente** (lição SimplePractice): dashboard do profissional lista evoluções não finalizadas, laudos prometidos e assinaturas em fila; nudge diário configurável — compliance CFM sem cobrança manual do gestor.
- Chat interno recepção↔profissional embutido; pré-anamnese respondida pelo paciente aparece pronta na tela.
- **Atalhos de teclado para 100% do fluxo** e paleta de comandos (Ctrl+K: "nova receita", "abrir último laudo", "agendar retorno 30d").

## 9. Escriba Ambiente com Evidência Vinculada (diferencial-assinatura)
Estado da arte 2026 (Abridge/Epic AI Charting), inexistente no Brasil com esta profundidade:
- **Captura ambiente** (opt-in por consulta, consentimento registrado): microfone do desktop/mobile grava a conversa; ASR (Whisper large, pt-BR, self-hosted — dado clínico não sai da infraestrutura) transcreve **em tempo real**.
- **Nota estruturada em tempo real**: LLM redige a evolução nas seções do template do profissional enquanto a consulta acontece; o médico vê a nota se formando e mantém contato visual com o paciente.
- **Evidência vinculada** (o recurso que gera confiança, pioneirado pela Abridge): cada trecho da nota é clicável e reproduz o segmento exato do áudio/transcrição que o originou. Revisão em segundos, não releitura completa.
- **Ações sugeridas a partir da conversa**: prescrições mencionadas viram rascunho de receita; exames citados viram pedido pré-montado; retorno mencionado vira sugestão de agendamento; CID e TUSS sugeridos com justificativa. Tudo em bandeja de revisão — nada é executado sem confirmação.
- Ditado tradicional e comandos de voz como modo alternativo.
- Marcação indelével "seção redigida com auxílio de IA, revisada pelo profissional" (governança CFM); áudio retido conforme política da clínica (padrão: descartar após assinatura; opção: reter criptografado).
- **Métrica exibida ao médico**: minutos economizados na semana (o número que fideliza).

## 10. Prescrição Digital
- Memed integrado (bulário, interações, genéricos) + receituário próprio com base ANVISA (fallback e independência).
- Modelos favoritos; **renovação de receita em ≤ 3 cliques** a partir do histórico.
- Receituário comum, controle especial (Portaria 344), antimicrobianos; impressão em modelos oficiais.
- Assinatura ICP-Brasil (A1 nuvem/A3) com **QR Code de validação pública** (lição ProDoctor, elevada a padrão de todos os documentos) — validador em página pública + padrão ITI.
- Envio por WhatsApp/e-mail/portal; farmácia valida pelo QR.

## 11. Documentos & Assinatura
- Editor de modelos com merge fields (nome, idade, CPF, CID, datas...); atestados, declarações, laudos (incl. **laudos neurodesenvolvimentais estruturados para escola/terapia** — seu nicho), solicitações, encaminhamentos, TCLEs.
- Assinatura digital em lote (fila de assinatura do dia); carimbo do tempo; QR de validação em tudo.
- Papel timbrado por clínica/profissional; PDF/A para arquivamento.

## 12. Teleconsulta
- LiveKit no prontuário: vídeo + nota na mesma tela; **sem instalação para o paciente** (link no navegador — lição Amplimed).
- Sala de espera virtual; teleconsultas **ilimitadas sem custo por consulta** (posicionamento comercial contra cobrança por uso).
- **Pagamento antecipado no link** (pré-pago derruba no-show de tele).
- Gravação opcional com consentimento registrado, anexada ao encontro; compartilhamento de tela; chat com troca de arquivos.
- **Escriba ambiente funciona na teleconsulta** (áudio já é digital — qualidade máxima de transcrição).
- Conformidade Resolução CFM: TCLE, identificação das partes, registro em prontuário.

## 13. Agenda & Recepção
**FHIR:** Schedule, Slot, Appointment, Location, Device (salas e equipamentos como recursos agendáveis de primeira classe).
- Multi-profissional, **multi-sala, multi-equipamento, multi-unidade**; visões dia/semana/mês/profissional/sala/equipamento.
- Tipos de procedimento (cor, duração, valor, preparo); agendamento em sessões/pacotes (terapias — 10 sessões com controle de saldo, essencial fono/TO/fisio/psico).
- Recorrentes; lista de espera com **encaixe automático** quando abre horário (oferta por WhatsApp aos da fila, primeiro-que-responder) e **auto-inscrição pelo paciente** no portal/link — sem trabalho manual da recepção (lição Jane App); bloqueios; feriados.
- Confirmação automática WhatsApp/SMS/e-mail com atualização de status via resposta; check-in por QR na recepção.
- **Predição de no-show** (§18): score por agendamento (histórico do paciente, antecedência, clima de convênio, horário); ações sugeridas — overbooking calculado, cobrança antecipada, lembrete extra. Nenhum concorrente BR tem.
- Integração Google/Apple Calendar bidirecional; integração de captação com Doctoralia/Google Reserve (recebe agendamentos de fora).

## 14. Financeiro (núcleo — consolidado da v1, íntegro)
Modelo: FHIR financeiro (Account, ChargeItem, Invoice, PaymentNotice, PaymentReconciliation, Coverage) espelho + relacional Gestão como fonte operacional (plano de contas, DRE, conciliação, NFS-e).

**Lançamentos:** receita/despesa/transferência; parcelado com taxas por bandeira/adquirente; multi-forma no mesmo recebimento; **lançamento automático ao encerrar atendimento** (Bot) — recepção só confirma; pela agenda (pré-pagamento) e pelo prontuário; recorrências com projeção; categorias em árvore + centros de custo (unidade/sala/serviço); múltiplas contas/caixas; sangria/suprimento; **fechamento de caixa cego por operador/turno**.

**Análise:** fluxo de caixa automático (diário/mensal, caixa e competência); contas a pagar/receber com aging 30/60/90 e alertas; **DRE gerencial automática**; margem por procedimento; ticket médio; receita por convênio/profissional/procedimento/origem; previsto×realizado; **conciliação bancária** (OFX + Open Finance) e de recebíveis de cartão (arquivo adquirente).

**Repasse médico:** regras por profissional×procedimento×convênio (%, fixo, progressivo; com/sem desconto de taxas e impostos); **split automático** no gateway ou apuração por período com extrato do profissional e aceite digital; conta-corrente do profissional (adiantamentos/descontos); **repasse sobre o efetivamente pago** (pós-glosa) como opção — honestidade que nenhum concorrente calcula.

**Cobrança:** Pix QR dinâmico com conciliação por webhook; cartão (link, pré-autorização para no-show); boleto; régua de inadimplência automática; recibos sequenciais; **NFS-e automática** (Focus NFe/eNotas, RPS em lote); antecipação de recebíveis (fase 3, parceria adquirente); **planos de assinatura da clínica** (membership B2C — lição Clínica nas Nuvens): a clínica cria planos recorrentes próprios (ex.: acompanhamento mensal, pacote de terapias), com cobrança recorrente, controle de utilização/saldo de sessões, carência e regras de cancelamento — receita previsível que nenhum líder trata como cidadão de primeira classe.

**Controles:** permissões finas (recepção lança, não vê DRE; profissional vê só o próprio repasse); trilha completa; estorno com justificativa, nunca deleção.

## 15. Estoque & Insumos
Lote/validade; entrada por nota (XML NF-e importável); **baixa automática por ficha técnica do procedimento**; mínimo com alerta; inventário; custo médio alimenta margem por procedimento no BI; rastreabilidade de vacinas/medicamentos por lote.

## 16. Mobile Offline-First (lição HiDoctor, superada)
- App React Native com SQLite local: **agenda, fichas e evolução funcionam sem internet**; sync bidirecional com resolução de conflito (last-writer-wins por campo + fila de revisão para colisões clínicas).
- Caso de uso real: atendimento domiciliar, hospital sem Wi-Fi, queda de internet da clínica — o dia não para.
- PWA desktop com cache de agenda do dia (degradação graciosa).
- Nenhum concorrente **em nuvem** tem isso; o único que tem (HiDoctor) é desktop legado.

## 17. Relatórios, BI & Coortes
- Dashboard: agenda do dia, faturamento, ocupação, faltas, NPS, **R$ recuperado de glosa**, minutos economizados pela IA.
- Relatórios operacionais completos (atendimentos, faltas, origem, produção, financeiro §14, TISS §Parte IV, estoque) com filtros avançados, export XLS/CSV/PDF, envio agendado.
- **Coortes clínicas**: pacientes por CID/idade/sem retorno há X meses/medicação em uso → alimenta recall e pesquisa clínica (com anonimização para exportação científica — diferencial para clínicas acadêmicas).
- **Rentabilidade real por convênio**: (pago − glosa perdida − custo operacional) ÷ atendimento — responde "vale a pena este convênio?".

## 18. Camada de IA (transversal, além do escriba)
Todas as predições rodam no serviço IA sobre eventos; features com governança (marcação, opt-in, auditoria):
- **No-show prediction** (score por agendamento + ação sugerida).
- **Sugestão de codificação** CID/TUSS com justificativa (reduz glosa técnica na origem).
- **Resposta assistida ao paciente** no inbox WhatsApp (rascunho para a recepção aprovar — lição Epic ART).
- **Busca conversacional** no prontuário ("quando foi a última crise convulsiva relatada?") com resposta + fontes clicáveis.
- **Detecção de anomalia financeira** (lançamento fora de padrão, taxa de cartão divergente do contrato).
- Antiglosa preditiva (Parte IV) — a IA mais rentável do sistema.

## 19. Comunicação, Marketing & Portal
- Campanhas e automações (aniversário, pós-consulta NPS, recall por coorte, reativação) por WhatsApp/e-mail; editor visual; métricas.
- **CRM de captação (funil de leads)** — lição Ninsaúde/iMedicina: pipeline lead→contato→agendou→compareceu→fidelizou, com origem por canal (Instagram, Google, indicação, Doctoralia), tarefas de follow-up para a recepção e **CAC por canal no BI** — fecha o ciclo marketing→receita que os concorrentes deixam em ferramenta separada.
- **Inbox WhatsApp da clínica** ligado ao cadastro (recepção compartilhada, histórico por paciente, resposta assistida por IA).
- Portal do paciente: agendamento 24h white-label (SEO da clínica), reagendamento com política, pré-pagamento, pré-anamnese, check-in antecipado, teleconsulta, documentos/receitas com QR, recibos/NFS-e, resultados liberados pelo profissional. Widget embutível + links para Instagram/Google Business.

## 20. Plataforma: Auth, LGPD, Eventos, Migração, API, Billing
- **Auth:** OAuth2/OIDC, MFA, SSO Google/Microsoft, sessões por dispositivo, política de senha, bloqueio progressivo.
- **LGPD/Auditoria:** AuditEvent em todo acesso ("quem viu qual prontuário"); Consent como recurso; relatório do titular; eliminação sob requisição com salvaguarda do prazo de guarda (20 anos CFM); logs append-only com hash encadeado; criptografia TLS 1.3 / AES-256; backups PITR cross-region; RPO ≤ 5min, RTO ≤ 1h; DR testado trimestralmente.
- **Bots (catálogo v1):** encerrou atendimento→Invoice+NPS+retorno; criou agendamento→lembretes T-48/24/3h; resposta WhatsApp→status; Invoice paga→baixa+recibo+NFS-e; Observation fora de faixa (curva < p3)→alerta clínico; slot liberado→lista de espera; demonstrativo chegou→conciliação (Parte IV).
- **Migração como arma comercial:** importadores dedicados **iClinic, Feegow, Amplimed, ProDoctor** (a partir dos exports que o cliente obtém) + CSV genérico + PDFs como anexos; wizard com de-dup, dry-run e relatório; migração assistida gratuita no plano anual — ataca diretamente o lock-in dos concorrentes.
- **API pública:** FHIR R4 + OpenAPI + webhooks; tokens com escopo por clínica; sandbox. Integrações roadmap: laboratórios (DiagnosticReport), **RNDS** (FHIR nativo = vantagem estrutural), contabilidade (Domínio/Contmatic), Open Finance.
- **Billing SaaS:** planos por profissional/mês com feature flags; trial 15 dias; dunning; medição de uso (WhatsApp, armazenamento, minutos de IA/tele). **Armas de pricing (lição Jane App):** staff administrativo (recepção/faturista) NÃO paga licença — só profissionais de saúde contam; **licença part-time** para quem atende < 20h/semana (ataca direto o recém-formado e o profissional liberal em transição); preço transparente sem taxa oculta, publicado no site.

## 21. Certificação & Conformidade (roadmap de credibilidade)
- **SBIS-CFM NGS2** (certificação do prontuário — lição Feegow: vira selo de venda) — projetar requisitos desde o dia 1 (assinatura, trilha, guarda), certificar na fase 3.
- ICP-Brasil/ITI para assinatura e validação; adequação às Resoluções CFM de prontuário e telemedicina; LGPD com RIPD documentado.

## 22. Requisitos não-funcionais (orçamentos com teste automatizado)
- Abrir prontuário < 800ms p95 · agenda do dia < 400ms · busca paciente < 200ms · salvar evolução < 300ms · gerar PDF < 2s · transcrição em tempo real com lag < 3s.
- Disponibilidade 99,9%; degradação graciosa (fila offline de escrita).
- Escala: 10k clínicas/1M pacientes por cluster; sharding por tenant além disso.
- WCAG 2.1 AA; teclado em 100% dos fluxos; i18n pt-BR → es/en.
- Testes: unit + integração + E2E Playwright por fluxo crítico + testes de carga por release; cobertura de auditoria (todo acesso a PHI gera AuditEvent — verificado em CI).

---

# PARTE IV — MÓDULO TISS + GESTÃO DE GLOSAS (íntegro, consolidado)

## 23. Tese
Concorrentes tratam TISS como gerador de guias; o recurso de glosa vive em planilha. **Nós tratamos como funil de receita com laço fechado: PREVENIR → RECUPERAR → APRENDER.** Meta contratual: reduzir taxa de glosa ≥50% em 90 dias; recuperar ≥70% do glosado recorrível.

## 24. Escopo
**Guias:** consulta, SP/SADT, honorários (v1); internação, odonto (v2); anexos quimio/radio/OPME (v3); guia de recurso de glosa padrão TISS (v1).
**Transações webservice** (quando a operadora expõe): elegibilidade, autorização+status, envio de lote+protocolo, demonstrativos, recurso+status, cancelamento. **Fallback universal:** XML para upload manual + espelho PDF idêntico ao padrão ANS.
**Multi-versão:** XSDs oficiais versionados; versão vigente por operadora×contrato com migração agendável; geração **metadata-driven** (nova versão = dados, não deploy); validação XSD obrigatória pré-envio; tabelas de domínio ANS versionadas com vigência.

## 25. Modelo de dados (Gestão) + mapeamento FHIR
Relacional: `operadora → perfil_operadora (canal, versão, prazos, peculiaridades JSONB, credenciais) → contrato_convenio (código prestador, tabela negociada, regras de plano)`; `tabela_precos (TUSS/CBHPM/própria, vigência) → item_tabela`; `guia (status, beneficiário, executante CBO, encounter_fhir_id, xml_hash) → guia_item → autorizacao (senha, validade, qtde)`; `lote → demonstrativo`; `glosa (motivo ANS, tipo adm/técnica/linear, status, prazo_recurso, responsável) → recurso (justificativa, anexos, valor_recuperado)`; `regra_glosa_aprendida (padrão JSONB, eficácia, origem manual/minerada)`; `evento_faturamento` append-only.
FHIR: Guia=`Claim` (+extensões br-tiss: senha, via, técnica, grau); item=`Claim.item` (TUSS como CodeSystem); carteirinha=`Coverage`; autorização=`ClaimResponse preauth`; demonstrativo/glosa=`ClaimResponse.adjudication` (motivo=tabela ANS); recurso=`Claim related appeal`; pagamento=`PaymentReconciliation`→financeiro. Relacional é fonte operacional; FHIR é espelho de interoperabilidade (outbox idempotente).

## 26. Máquina de estados
`RASCUNHO→VALIDAÇÃO→PRONTA→[AGUARD_AUTORIZAÇÃO→AUTORIZADA|NEGADA]→PRONTA_P_LOTE→EM_LOTE→PROTOCOLADA→ANALISADA→{PAGA_INTEGRAL|PAGA_PARCIAL|GLOSADA_TOTAL|CANCELADA}`; itens glosados: `NOVA→EM_ANÁLISE→{RECURSADA→AGUARD_RESPOSTA→{RECUPERADA|INDEFERIDA→2ª_INSTÂNCIA}|PERDIDA_ACEITA}`.
Invariantes: guia não entra em lote sem score do validador ≥ limiar; lote fechado é imutável (correção = cancelar+reemitir, rastreado); **prazo de recurso é timer de SLA por operadora** (7 dias antes → diário → escala gestor); toda transição grava evento (replay possível); demonstrativo dispara conciliação automática.

## 27. Cockpit de Glosas
Fila priorizada por **valor × urgência de prazo**; filtros (operadora/motivo/profissional/competência/responsável); triagem em lote (recorrer/aceitar/investigar/atribuir); **bancada de recurso**: guia + demonstrativo + prontuário/anexos em 1 clique + editor com templates por motivo (variáveis auto-preenchidas) + evidências — incluindo o **snapshot de elegibilidade que o sistema guardou no dia do atendimento** (prova irrefutável); envio eletrônico (`recursoGlosa`) ou guia padrão XML/PDF; recurso em lote por operadora; 2ª instância com novo prazo; **perda exige motivo** (nada some em silêncio). Indicadores no topo: R$ glosado · em recurso · recuperado · taxa de recuperação · prazos vencendo em 7 dias.

## 28. Motor Antiglosa (4 camadas)
**C1 Esquema (bloqueante):** XSD da versão da operadora.
**C2 Regras ANS (bloqueante):** carteirinha válida NA DATA DE EXECUÇÃO; CBO×TUSS compatíveis; qtde ≤ autorizada; senha vigente; datas coerentes; duplicidade; sexo/idade×procedimento.
**C3 Regras por operadora (configurável):** motor declarativo JSON no perfil ("Operadora X glosa consulta+procedimento juntos → separar"; "Y exige indicação clínica no campo obs para TUSS Z"...); origem manual ou minerada; **eficácia medida** (glosas evitadas por regra).
**C4 Aprendizado:** todo demonstrativo alimenta minerador (motivo×características da guia); padrões com suporte estatístico viram **sugestões de regra** com aprovação humana; **agregação anonimizada multi-tenant por operadora** — a glosa da clínica A previne a da clínica B amanhã. **Efeito de rede que nenhum concorrente possui.**
Saída: score de risco 0–100 por guia + findings com correção em 1 clique. **Prevenção na origem:** elegibilidade automática no agendamento e check-in com snapshot probatório; alerta de autorização necessária ao agendar; máscara de carteirinha por operadora no cadastro.

## 29. Conciliação & Analytics de faturamento
Parser de demonstrativo (webservice/XML/OCR de PDF) → casa lote→guia→**item**: pago integral, parcial (diferença vira glosa com motivo), não processado; divergências em fila — incl. **glosa de tabela** (pago abaixo do contratado — a perda invisível que detectamos); `PaymentReconciliation` → lançamento no financeiro por competência; repasse recalculado sobre o pago; aging real por operadora alimenta fluxo de caixa projetado.
Dashboards (drill-down até a guia): taxa de glosa por operadora/motivo/profissional/procedimento com meta e tendência; funil glosado→recursado→recuperado→perdido; taxa de sucesso por template de justificativa; **perda evitada pelo motor** (o número que vende); tempo médio de pagamento × prazo contratual (munição de renegociação); rentabilidade real por convênio.

## 30. Arquitetura do módulo
`tiss-core` (estados) · `tiss-serializer` (XML por versão, metadata-driven) · `tiss-validator` (C1–C3) · `tiss-transport` (adaptadores: SOAP TISS | arquivo | manual — operadora nova = configuração, não código) · `tiss-parser` (demonstrativos+OCR) · `glosa-engine` (fila, SLA, recursos, templates) · `glosa-miner` (C4 batch) · `tiss-analytics` (agregações materializadas). Credenciais em vault por tenant; XMLs arquivados imutáveis (S3+hash) — trilha probatória; guia contém dado clínico → políticas do prontuário se aplicam (AuditEvent ao abrir).

---

# PARTE V — EXECUÇÃO

## 31. Roadmap
**Fase 0 — Fundação (sem. 1–4):** Medplum self-hosted multi-tenant · auth/MFA · design system · CI/CD · observabilidade com orçamentos de latência · perfis FHIR BR (ImplementationGuide) · esqueleto Gestão+IA.
**Fase 1 — MVP Atendimento (sem. 5–12):** cadastro · agenda completa (salas/equipamentos/sessões) · prontuário tela única + 3 templates (incl. neuroped) · fluxo de atendimento + fila viva + trava CFM · documentos com merge+PDF+QR · lembretes WhatsApp com confirmação automática · financeiro essencial (lançamentos, formas, fluxo de caixa, recibo, lançamento automático pós-consulta). *Saída: sua clínica opera o dia inteiro só no sistema (cliente zero).* 
**Fase 2 — Paridade+ (sem. 13–24):** prescrição Memed + ICP-Brasil + QR validação · teleconsulta com pagamento no link · portal do paciente + agendamento online · financeiro completo (repasse/split, DRE, conciliação bancária, Pix/cartão, NFS-e, fechamento de caixa) · **TISS v1 completo** (guias, lotes, elegibilidade/autorização, máquina de estados, conciliação, cockpit de glosas, validador C1–C3, dashboards) · relatórios · marketing/inbox · estoque · migração iClinic/Feegow/Amplimed · mobile offline-first (leitura+agenda).
**Fase 3 — Superação (sem. 25–36):** **escriba ambiente com evidência vinculada** · no-show prediction · busca conversacional · glosa-miner C4 + rede antiglosa multi-tenant · OCR demonstrativos · glosa de tabela · BI coortes + rentabilidade por convênio · API pública + laboratórios · RNDS · app paciente · SBIS · antecipação de recebíveis.

## 32. Equipe & operação
Núcleo: 1 tech lead full-stack TS · 2 full-stack · 1 backend (financeiro/TISS) · 1 ML/IA (fase 2+) · 1 designer · 1 QA · você = domain expert + PO + cliente zero. Fases 0–2 em ~6 meses com esse time; agentes de código (Claude Code) como multiplicadores com o adversarial-audit workflow que você já domina do DOM/Kael.

## 33. KPIs do produto (o placar)
| KPI | Meta v1 | Por quê |
|---|---|---|
| Minutos economizados/consulta (escriba+atalhos) | ≥ 6 min | Fideliza o médico |
| Taxa de glosa do cliente | −50% em 90 dias | Fideliza o gestor; ROI explícito |
| R$ recuperado de glosa / mês | ≥ 70% do recorrível | O número da proposta comercial |
| No-show | −40% (confirmação+predição+pré-pago) | Receita direta |
| p95 abrir prontuário | < 800ms | Fluidez percebida |
| Tempo de migração de concorrente | < 48h assistida | Quebra o lock-in |
| NPS profissional / gestor | ≥ 70 / ≥ 60 | Retenção |

## 34. Síntese — por que este produto é superior
1. **Única fundação FHIR-nativa do mercado BR** → RNDS, portabilidade, confiança ("seus dados são seus").
2. **IA no loop de eventos**, não na vitrine: escriba com evidência vinculada, antiglosa preditiva, no-show prediction — cada uma com ROI mensurável exibido ao cliente.
3. **TISS como funil de receita com efeito de rede** (prevenir→recuperar→aprender, multi-tenant) — estruturalmente impossível de copiar rápido por quem tem modelo de dados legado.
4. **Financeiro gerencial de verdade** (DRE, conciliação, glosa de tabela, repasse sobre o pago) — profundidade que nenhum líder entrega.
5. **Offline-first em nuvem** — categoria própria.
6. **Fluidez como contrato**: orçamentos de latência e cliques com teste automatizado — qualidade percebida vira requisito de engenharia, não promessa.

---
*PEP Master Blueprint v2.0 — unifica e substitui os documentos v1. Base Medplum Apache 2.0; todo o código de produto proprietário.*
