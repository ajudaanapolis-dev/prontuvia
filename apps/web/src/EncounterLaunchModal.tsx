type Props = {
  patientName: string;
  error?: string;
  retry: () => void;
  close: () => void;
};

export function EncounterLaunchModal({ patientName, error, retry, close }: Props) {
  return (
    <div className="clinical-layer" role="dialog" aria-modal="true" aria-label="Preparando atendimento">
      <section className={`clinical-launch-card ${error ? "error" : ""}`}>
        <div className="launch-icon">{error ? "!" : <span className="launch-spinner" />}</div>
        <span className="eyebrow">{error ? "Não foi possível abrir" : "Preparando atendimento"}</span>
        <h2>{patientName}</h2>
        <p>{error ?? "Carregando o prontuário e verificando o rascunho da consulta…"}</p>
        {error && <div className="launch-actions">
          <button className="secondary-button" type="button" onClick={close}>Fechar</button>
          <button className="primary-button compact" type="button" onClick={retry}>Tentar novamente</button>
        </div>}
      </section>
    </div>
  );
}
