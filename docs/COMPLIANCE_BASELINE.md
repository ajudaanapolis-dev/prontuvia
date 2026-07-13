# Baseline técnico de conformidade brasileira

Este documento orienta engenharia e não substitui parecer jurídico ou processo formal de certificação.

## Requisitos que moldam o produto

- Dados de saúde são dados pessoais sensíveis. Finalidade e base legal devem ser documentadas por operação, sem consentimento genérico para todo o sistema.
- Segurança e privacidade devem existir desde a concepção, com registros das operações de tratamento.
- Prontuários devem permanecer cronológicos, identificados e preservados segundo as regras aplicáveis; solicitações de eliminação não podem apagar automaticamente um prontuário sujeito à retenção.
- Uma evolução finalizada não é sobrescrita. Correções geram versão ou adendo com motivo, autoria, data e hora, preservando o original.
- “Finalização eletrônica interna” não deve ser anunciada como assinatura digital ICP-Brasil ou conformidade paperless.
- Incidentes devem possuir processo de detecção, registro, avaliação e comunicação dentro dos prazos aplicáveis.

## Fontes oficiais de referência

- [LGPD compilada — Lei nº 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709compilado.htm)
- [Lei nº 13.787/2018 — digitalização e guarda de prontuário](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13787-27-dezembro-2018-787543-publicacaooriginal-157119-pl.html)
- [ANPD — Guia de agentes de tratamento](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/Segunda_Versao_do_Guia_de_Agentes_de_Tratamento_retificada.pdf/@@display-file/file)
- [ANPD — Guia de segurança da informação](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-vf.pdf/@@display-file/file)
- [ANPD — Comunicação de incidente de segurança](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis)
- [ANPD — Relatório de Impacto à Proteção de Dados](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/relatorio-de-impacto-a-protecao-de-dados-pessoais-ripd)
- [CFM — Código de Ética Médica](https://portal.cfm.org.br/images/PDF/cem2019.pdf)
- [CFM — Resolução nº 1.821/2007](https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2007/1821_2007.pdf)
- [SBIS — Requisitos de Segurança v5.2](https://sbis.org.br/certificacao/v5.2/Requisitos_Certificacao_SBIS_Seguranca_V5.2.pdf)

## Gates antes de produção

1. Registro das Operações de Tratamento e RIPD revisados.
2. Contratos controlador–operador e inventário de suboperadores.
3. Isolamento multi-tenant validado em API, banco, storage, cache, filas e backups.
4. MFA, recuperação de conta, acesso emergencial e desligamento testados.
5. Imutabilidade, adendos, concorrência e exportação do prontuário testados.
6. Backups criptografados e restauração real comprovada.
7. Ausência de dados clínicos em logs e telemetria.
8. SAST, análise de dependências, DAST e pentest independente.
9. Plano de incidente exercitado.
10. Validação específica do modelo de assinatura e da operação paperless.
