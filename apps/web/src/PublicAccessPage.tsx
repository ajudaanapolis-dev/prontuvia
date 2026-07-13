import { FormEvent } from "react";

type Login = { email: string; password: string; tenantSlug: string };
const plans = [
  { code: "essential", badge: "Comece agora", name: "Essencial", price: "R$ 99", suffix: "/mês", description: "Para profissional autônomo ou consultório pequeno", limits: "1 profissional + 1 secretária · 1 unidade", features: ["Agenda clínica e agendamento online", "Cadastro e histórico de pacientes", "Prontuário eletrônico e anamnese", "CID-10, CID-11 e documentos clínicos", "Financeiro básico e 5 GB de arquivos"] },
  { code: "professional", badge: "Mais escolhido", name: "Profissional", price: "R$ 249", suffix: "/mês", description: "Para equipes que precisam organizar atendimento e gestão", limits: "Até 3 profissionais + 2 secretárias · 2 unidades", features: ["Tudo do plano Essencial", "Portal do paciente e formulários pré-consulta", "Comissões e repasses por procedimento", "Contas a pagar e receber e fluxo de caixa", "Relatórios clínicos e financeiros", "Lista de espera, confirmações e 25 GB"] },
  { code: "clinic", badge: "Mais completo", name: "Empresa", price: "R$ 499", suffix: "/mês", description: "Para clínicas estruturadas, equipes maiores e redes", limits: "Até 10 profissionais + 5 colaboradores · 5 unidades", features: ["Tudo do plano Profissional", "Gestão multiunidade e permissões avançadas", "DRE, centros de custo e conciliação manual", "Estoque, auditoria e relatórios avançados", "API FHIR e integrações homologadas", "100 GB e suporte prioritário"] },
];

const addOns = [
  { name: "WhatsApp e automações", description: "Confirmações, lembretes, campanhas e mensagens transacionais. Mensalidade mais consumo." },
  { name: "Teleconsulta", description: "Sala segura, consentimento e registro integrado ao prontuário." },
  { name: "TISS e gestão de glosas", description: "Guias, lotes, elegibilidade, retorno, glosas e recursos para convênios." },
  { name: "Notas fiscais", description: "NFSe e NF-e conforme prefeitura, estado e provedor homologado." },
  { name: "Pagamentos e conciliação automática", description: "Pix, boleto, cartão, split, baixa e conciliação bancária automatizada." },
  { name: "Migração assistida", description: "Importação, saneamento e conferência de dados do sistema anterior." },
  { name: "Capacidade adicional", description: "Profissionais, colaboradores, unidades e armazenamento além do limite do plano." },
  { name: "Integrações premium", description: "PACS/RIS, laboratórios, contabilidade, CRM e projetos de API sob medida." },
];

export function PublicAccessPage({ login, setLogin, submit, error, onSignup }: { login: Login; setLogin: (value: Login) => void; submit: (event: FormEvent) => void; error: string; onSignup: (plan: string) => void }) {
  return (
    <main className="public-access commercial-home">
      <header className="commercial-header">
        <a className="commercial-brand" href="#inicio"><img src="/prontuvia-symbol.png" alt="Símbolo do Prontuvia" /><b>Prontuvia</b></a>
        <nav><a href="#recursos">Recursos</a><a href="#planos">Planos e preços</a><a href="#entrar">Entrar</a><button className="primary-button compact" onClick={() => onSignup("professional")}>Criar minha clínica</button></nav>
      </header>

      <section className="commercial-intro" id="inicio">
        <span>PRONTUÁRIO ELETRÔNICO PARA CLÍNICAS E PROFISSIONAIS</span>
        <h1>Organize sua clínica.<br />Cuide melhor de cada paciente.</h1>
        <p>Agenda, prontuário, documentos, financeiro e comissões reunidos em uma plataforma segura.</p>
        <div><a className="primary-button" href="#planos">Conhecer os planos</a><a className="commercial-text-button" href="#entrar">Já sou cliente →</a></div>
      </section>

      <section className="pricing-section commercial-pricing" id="planos">
        <div className="pricing-heading"><span>PLANOS E PREÇOS</span><h2>Escolha o plano ideal para sua clínica</h2><p>Comece com 14 dias de avaliação. Você poderá configurar a clínica após criar a conta.</p></div>
        <div className="pricing-cards">
          {plans.map((plan) => (
            <article key={plan.code} className={plan.code === "professional" ? "featured" : ""}>
              <span>{plan.badge}</span><h3>{plan.name}</h3><p>{plan.description}</p>
              <div className="plan-price"><b>{plan.price}</b><small>{plan.suffix}</small></div>
              <strong>{plan.limits}</strong>
              <ul>{plan.features.map((item) => <li key={item}>✓ {item}</li>)}</ul>
              <button className={plan.code === "professional" ? "primary-button" : "secondary-button"} onClick={() => onSignup(plan.code)}>{plan.code === "clinic" ? "Escolher o plano Empresa" : "Escolher este plano"}</button>
            </article>
          ))}
        </div>
      </section>

      <section className="commercial-addons" aria-labelledby="addons-title">
        <div className="pricing-heading"><span>MÓDULOS OPCIONAIS</span><h2>Contrate somente o que sua operação precisar</h2><p>Recursos especializados são adicionados ao plano sem obrigar todas as clínicas a pagar por eles.</p></div>
        <div className="addon-cards">
          {addOns.map((item) => <article key={item.name}><div>+</div><h3>{item.name}</h3><p>{item.description}</p><span>Contratação separada</span></article>)}
        </div>
        <small id="addons-title">Valores dos módulos variam conforme volume, provedor, implantação e integrações necessárias.</small>
      </section>

      <section className="commercial-resources" id="recursos">
        <div><span>ASSISTÊNCIA</span><h2>PEP completo para a rotina clínica</h2><p>Agenda, anamnese, CID-10/CID-11, prontuário imutável e documentos clínicos.</p></div>
        <div><span>GESTÃO</span><h2>Financeiro separado por responsabilidade</h2><p>Receitas, despesas, comissões e indicadores com acesso conforme o perfil do usuário.</p></div>
        <div><span>SEGURANÇA</span><h2>Cada clínica em seu próprio ambiente</h2><p>Permissões por papel, auditoria e isolamento de dados entre os assinantes.</p></div>
      </section>

      <section className="commercial-login-section" id="entrar">
        <div className="commercial-login-copy"><span>ÁREA DO CLIENTE</span><h2>Acesse sua clínica no Prontuvia</h2><p>Informe seus dados e o identificador escolhido durante o cadastro.</p></div>
        <form className="public-login" onSubmit={submit}>
          <span className="eyebrow">Acesso ao Prontuvia</span><h2>Entrar</h2>
          <label>E-mail<input type="email" value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} required /></label>
          <label>Senha<input type="password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} required /></label>
          <label>Identificador da clínica<input value={login.tenantSlug} onChange={(event) => setLogin({ ...login, tenantSlug: event.target.value })} required /></label>
          {error && <div className="form-message error">{error}</div>}
          <button className="primary-button">Entrar →</button>
          <button type="button" className="secondary-button" onClick={() => onSignup("professional")}>Criar nova conta</button>
        </form>
      </section>
    </main>
  );
}
