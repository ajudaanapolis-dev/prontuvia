# Prontuvia 2.1.0 — fluxo clínico FHIR unificado

## Entregue

- Sincronização automática e idempotente entre o banco operacional e o Medplum.
- `Patient` ao cadastrar ou editar pacientes, incluindo dados demográficos e alergias.
- `Appointment` ao criar, editar ou alterar o estado do agendamento.
- `Encounter` ao iniciar, salvar ou finalizar um atendimento.
- `Condition` para hipótese diagnóstica CID-10/CID-11.
- `MedicationRequest` e `ServiceRequest` para prescrições e exames.
- `Composition` para a nota clínica e `Provenance` na finalização.
- `DocumentReference` para documentos clínicos imutáveis.
- Vínculos persistentes local/FHIR, evitando duplicação.
- Fila durável com retentativa exponencial e reprocessamento manual.
- Monitor da ponte FHIR em Gestão avançada → Medplum.
- Bootstrap idempotente: uma segunda execução não recria a clínica.

## Atualização local

Preserve o `.env` atual e execute:

```bash
npm install
docker compose up -d
npm run db:migrate
npm run dev:integrated
```

A migração `0013_fhir_clinical_bridge.sql` não apaga prontuários existentes.

## Teste funcional sugerido

1. Criar ou editar um paciente.
2. Criar um agendamento e iniciar o atendimento.
3. Registrar diagnóstico, finalizar e gerar um documento.
4. Abrir Gestão avançada → Medplum e confirmar a fila como sincronizada.
5. Conferir os recursos no Console Medplum.

Falhas temporárias do Medplum não cancelam a operação local. O item permanece na fila e pode ser reprocessado pelo botão **Tentar novamente**.
