# Prontuvia v1.4 — implantação local

Esta versão entrega a camada de relacionamento com o paciente em modo local e
deixa o adaptador da API oficial do WhatsApp preparado para homologação.

## Atualização segura

1. Faça uma cópia do diretório atual e um backup do PostgreSQL.
2. Extraia o pacote novo sobre uma pasta nova.
3. Copie apenas o seu arquivo `.env` da instalação anterior para a pasta nova.
4. Execute `npm install`.
5. Confirme que PostgreSQL, Redis e MinIO estão ativos com `docker compose ps`.
6. Execute `npm run db:migrate` uma única vez.
7. Não execute `db:bootstrap` novamente em um banco que já possui dados.
8. Inicie a API com `npm run dev`.
9. Em outro terminal, inicie a interface com `npm run dev:web`.
10. No navegador, use `Ctrl + Shift + R` para descartar arquivos antigos.

## O que já vem configurado

- Agendamento online habilitado por clínica.
- Portal do paciente habilitado por clínica.
- Escala inicial de segunda a sexta, das 08h às 18h, para novas contratações.
- Confirmação criada imediatamente após o agendamento.
- Lembrete padrão 24 horas antes da consulta.
- Reagendamento cancela lembretes antigos e cria os novos.
- Cancelamento interrompe lembretes pendentes.
- WhatsApp em modo `sandbox`, sem disparos reais e sem custo.
- Modelos sugeridos para confirmação, lembrete e código de acesso.

O proprietário encontra os endereços públicos e a fila no menu
**Comunicação**. Para a clínica `clinica-demonstracao`, por exemplo:

- `http://localhost:5173/agendar/clinica-demonstracao`
- `http://localhost:5173/portal/clinica-demonstracao`

## Ativação futura do WhatsApp real

Mantenha `WHATSAPP_PROVIDER=sandbox` durante os testes. Para homologação com a
Meta, configure no `.env` o identificador do número, token de acesso, segredo do
aplicativo e token de verificação; publique a API em HTTPS; cadastre o webhook
exibido no Prontuvia; e aprove os três modelos na conta WhatsApp Business.

Credenciais não são incluídas no pacote e nunca devem ser colocadas no código
do navegador.

## Limites desta entrega

O fluxo real de WhatsApp depende da aprovação da conta, dos modelos e do número
pela Meta. O portal atual permite consultar e cancelar agendamentos, mas ainda
não expõe prontuários, receitas ou documentos clínicos — essa separação é
intencional para reduzir risco de privacidade nesta etapa.
