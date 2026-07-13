import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; onClose: () => void };
type State = { error: string | null };

export class ClinicalErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error: error.message || "Falha desconhecida ao abrir o prontuário." };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("clinical_editor_render_failed", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="clinical-layer" role="alertdialog" aria-modal="true">
        <section className="clinical-launch-card error">
          <div className="launch-icon">!</div>
          <span className="eyebrow">Falha ao abrir o prontuário</span>
          <h2>A janela clínica encontrou um erro</h2>
          <p>{this.state.error}</p>
          <button className="primary-button compact" type="button" onClick={this.props.onClose}>Fechar e tentar novamente</button>
        </section>
      </div>
    );
  }
}
