import { useEffect, useRef, useState } from "react";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type ClassificationSystem = "CID10" | "CID11";
export type ClassificationItem = { system: ClassificationSystem; code: string; title: string; release: string; source: string };
type Value = { cid10: string; cid11: string; description: string; mappingNote: string };
type Props = { value: Value; onChange: (value: Value) => void };
type SearchState = { system: ClassificationSystem; items: ClassificationItem[] } | null;

function errorMessage(code: string): string {
  if (code === "who_icd_not_configured") return "Configure as credenciais gratuitas da API CID da OMS no arquivo .env para ativar a pesquisa CID-11.";
  return "Não foi possível consultar a classificação agora. Você ainda pode preencher o código manualmente.";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { credentials: "include", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, ...init });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "classification_request_failed");
  return payload;
}

export function ClassificationPicker({ value, onChange }: Props) {
  const [search, setSearch] = useState<SearchState>(null);
  const [loading, setLoading] = useState<ClassificationSystem | null>(null);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const query = (system: ClassificationSystem, text: string) => {
    if (timer.current) clearTimeout(timer.current);
    const term = text.trim();
    if (!term) { setSearch(null); setMessage(""); return; }
    timer.current = setTimeout(async () => {
      setLoading(system); setMessage("");
      try {
        const data = await api<{ items: ClassificationItem[] }>(`/v1/classifications/search?system=${system}&q=${encodeURIComponent(term)}&limit=10`);
        setSearch({ system, items: data.items });
        if (!data.items.length) setMessage("Nenhum código encontrado para esta busca.");
      } catch (error) {
        setSearch(null);
        setMessage(errorMessage(error instanceof Error ? error.message : ""));
      } finally { setLoading(null); }
    }, 250);
  };

  const suggestCounterpart = async (item: ClassificationItem, next: Value) => {
    try {
      const data = await api<{ item: ClassificationItem | null; warning: string }>("/v1/classifications/suggest-counterpart", {
        method: "POST", body: JSON.stringify({ sourceSystem: item.system, code: item.code, title: item.title }),
      });
      if (!data.item) {
        onChange({ ...next, mappingNote: "Nenhuma correspondência automática encontrada; informe o outro sistema manualmente." });
        return;
      }
      onChange({ ...next, cid10: item.system === "CID11" ? data.item.code : next.cid10, cid11: item.system === "CID10" ? data.item.code : next.cid11, mappingNote: data.warning });
    } catch (error) {
      onChange(next);
      setMessage(errorMessage(error instanceof Error ? error.message : ""));
    }
  };

  const select = (item: ClassificationItem) => {
    setSearch(null); setMessage("");
    const next = { ...value, cid10: item.system === "CID10" ? item.code : value.cid10, cid11: item.system === "CID11" ? item.code : value.cid11, description: item.title, mappingNote: "" };
    onChange(next);
    void suggestCounterpart(item, next);
  };

  const resolveTypedCode = async (system: ClassificationSystem, text: string) => {
    const term = text.trim();
    if (!term) return;
    try {
      const data = await api<{ items: ClassificationItem[] }>(`/v1/classifications/search?system=${system}&q=${encodeURIComponent(term)}&limit=10`);
      const exact = data.items.find((item) => item.code.toUpperCase() === term.toUpperCase());
      if (exact) select(exact);
    } catch { /* preenchimento manual permanece disponível */ }
  };

  const field = (system: ClassificationSystem, label: string, code: string, placeholder: string) => (
    <div className="classification-field">
      <label><span>{label}<small>{system === "CID10" ? "DATASUS" : "OMS"}</small></span>
        <input value={code} onChange={(event) => { const nextCode = event.target.value.toUpperCase(); onChange({ ...value, [system === "CID10" ? "cid10" : "cid11"]: nextCode, mappingNote: "" }); query(system, nextCode); }} onFocus={() => code && query(system, code)} onBlur={(event) => { window.setTimeout(() => void resolveTypedCode(system, event.target.value), 160); }} placeholder={placeholder} autoComplete="off" />
      </label>
      {loading === system && <span className="classification-loading">Pesquisando…</span>}
      {search?.system === system && search.items.length > 0 && <div className="classification-results" role="listbox">
        {search.items.map((item) => <button type="button" key={`${item.system}-${item.code}`} onMouseDown={(event) => event.preventDefault()} onClick={() => select(item)}><b>{item.code}</b><span>{item.title}</span><small>{item.release}</small></button>)}
      </div>}
    </div>
  );

  return <section className="classification-picker wide-field">
    <div className="classification-grid">{field("CID10", "CID-10", value.cid10, "Ex.: J06.9 ou faringite")}<span className="classification-link" aria-hidden="true">⇄</span>{field("CID11", "CID-11", value.cid11, "Ex.: CA40 ou pneumonia")}</div>
    <label className="classification-description">Hipótese diagnóstica<input value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} placeholder="Preenchida ao selecionar um código; permanece editável" /></label>
    {(value.mappingNote || message) && <p className={message ? "classification-message warning" : "classification-message"}>{message || value.mappingNote}</p>}
  </section>;
}
