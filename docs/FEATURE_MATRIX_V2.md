# Matriz de entrega Prontuvia 2.0

| Domínio | Implementação local | Integração externa |
|---|---|---|
| Medplum self-hosted/FHIR | Completa na distribuição | Não depende de SaaS Medplum |
| Pacientes, agenda, encontros e timeline | Medplum Provider + fluxo Prontuvia | — |
| Documentos, exames, medicações e cobertura | Componentes Medplum incorporados | Memed/ICP/laboratórios por adaptador |
| Multi-clínica, perfis e auditoria | PostgreSQL RLS + Projects Medplum | — |
| Financeiro e repasse por procedimento | Implementado | Split/gateway exige PSP |
| WhatsApp, portal e agendamento online | Implementado em sandbox | Meta exige conta e templates homologados |
| TISS, guias, itens, risco e glosas | Implementado localmente | Webservices variam por operadora |
| NFSe/NF-e | Sandbox + persistência implementados | Município/provedor exige credenciais |
| Conciliação | Importação OFX implementada | Open Finance exige parceiro/consentimento |
| Migração | CSV iClinic/Feegow/Amplimed/ProDoctor/genérico | Exportação deve ser fornecida pelo cliente |
| Estoque | Saldo, mínimo, custo e movimentos implementados | XML NF-e pode ser adicionado ao adaptador |
| IA | Fila, auditoria e revisão humana implementadas | Modelo local/cloud deve ser configurado |
| Teleconsulta | Domínio, consentimento e sala implementados | LiveKit deve ser provisionado |

“Implementado localmente” significa código, banco, API e interface executáveis. Não significa homologação de fornecedor externo.
