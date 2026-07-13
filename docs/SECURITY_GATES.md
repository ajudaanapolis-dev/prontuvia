# Gates antes de dados reais

Nenhum dado clínico real deve ser inserido antes de todos os gates estarem aprovados e documentados.

## Identidade e acesso

- MFA disponível para administradores e profissionais.
- Cookies seguros, rotação de sessões, revogação e limitação de tentativas.
- Menor privilégio validado por testes de matriz de permissões.
- Fluxo formal de entrada, alteração de função e desligamento de usuários.

## Dados e prontuário

- RLS testado contra vazamento cruzado entre tenants.
- Finalização de prontuário e adendos testados como invariantes.
- Criptografia em trânsito e em repouso verificada.
- Arquivos protegidos por autorização e URLs de curta duração.
- Exportação e portabilidade do prontuário testadas.

## Operação

- Backups criptografados, restauração integral e restauração pontual testadas.
- Logs sem conteúdo clínico ou credenciais.
- Alertas de acesso anômalo e resposta a incidentes.
- Inventário de operadores, subprocessadores e integrações.
- Política de retenção, descarte e continuidade aprovada.

## Qualidade

- Testes unitários, integração, E2E e concorrência.
- SAST, análise de dependências e secret scanning.
- Pentest independente antes da produção.
- Revisão jurídica e regulatória brasileira por profissionais habilitados.
