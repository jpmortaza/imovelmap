"use client";

import { useEffect, useState, useCallback } from "react";

interface Imovel {
  id: string;
  title: string;
  price: number | null;
  price_formatted: string | null;
  transaction_type: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area: number | null;
  parking_spaces: number | null;
  images: string[];
  source_url: string;
  source: string;
}

interface LeaseItem {
  id: string;
  imovel_id: string;
  status: string;
  imovel: Imovel | null;
}

interface Proprietario {
  id?: string;
  nome: string;
  telefone: string;
  email: string;
  cpf_cnpj: string;
  origem: string;
  notas: string;
}

interface LookupResult {
  cepData?: {
    logradouro: string;
    complemento: string;
    bairro: string;
    localidade: string;
    uf: string;
  };
  cnpjData?: {
    nome: string;
    fantasia: string;
    socios: Array<{ nome: string; qual: string }>;
    situacao: string;
  };
  cartorioHint?: string;
  iptuUrl?: string;
  suggestions: string[];
}

const OUTCOMES = [
  { value: "contatou_proprietario", label: "Contatei proprietario" },
  { value: "agendou_visita", label: "Agendou visita" },
  { value: "sem_resposta", label: "Sem resposta" },
  { value: "descartado", label: "Descartado" },
] as const;

const ORIGENS = [
  { value: "matricula", label: "Matricula" },
  { value: "vizinho", label: "Vizinho" },
  { value: "portaria", label: "Portaria" },
  { value: "internet", label: "Internet" },
  { value: "outro", label: "Outro" },
];

const emptyProp: Proprietario = {
  nome: "",
  telefone: "",
  email: "",
  cpf_cnpj: "",
  origem: "internet",
  notas: "",
};

export default function PainelPage() {
  const [lease, setLease] = useState<LeaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);
  const [openPropForm, setOpenPropForm] = useState<string | null>(null);
  const [propForms, setPropForms] = useState<Record<string, Proprietario>>({});
  const [savingProp, setSavingProp] = useState(false);
  const [lookupResults, setLookupResults] = useState<Record<string, LookupResult>>({});
  const [lookupLoading, setLookupLoading] = useState<string | null>(null);
  const [lookupOpen, setLookupOpen] = useState<Record<string, boolean>>({});

  const fetchLease = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/painel/lease");
      const data = await res.json();
      setLease(data.items ?? []);
    } catch {
      setLease([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLease();
  }, [fetchLease]);

  async function handleMark(distribuicaoId: string, outcome: string) {
    setMarking(distribuicaoId);
    try {
      await fetch("/api/painel/marcar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distribuicaoId, outcome, nota: "" }),
      });
      await fetchLease();
    } finally {
      setMarking(null);
    }
  }

  function togglePropForm(imovelId: string) {
    if (openPropForm === imovelId) {
      setOpenPropForm(null);
      return;
    }
    setOpenPropForm(imovelId);
    if (!propForms[imovelId]) {
      fetch(`/api/painel/proprietario?imovelId=${imovelId}`)
        .then((r) => r.json())
        .then((data) => {
          setPropForms((prev) => ({
            ...prev,
            [imovelId]: data.proprietario ?? { ...emptyProp },
          }));
        })
        .catch(() => {
          setPropForms((prev) => ({ ...prev, [imovelId]: { ...emptyProp } }));
        });
    }
  }

  async function handleSaveProp(imovelId: string) {
    const form = propForms[imovelId];
    if (!form) return;
    setSavingProp(true);
    try {
      const method = form.id ? "PUT" : "POST";
      await fetch("/api/painel/proprietario", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, imovelId }),
      });
      setOpenPropForm(null);
    } finally {
      setSavingProp(false);
    }
  }

  function updateField(imovelId: string, field: keyof Proprietario, value: string) {
    setPropForms((prev) => ({
      ...prev,
      [imovelId]: { ...(prev[imovelId] || emptyProp), [field]: value },
    }));
  }

  async function handleLookup(imovelId: string) {
    setLookupLoading(imovelId);
    setLookupOpen((prev) => ({ ...prev, [imovelId]: true }));
    try {
      const res = await fetch(`/api/painel/lookup?imovelId=${imovelId}`);
      const data = await res.json();
      if (res.ok) {
        setLookupResults((prev) => ({ ...prev, [imovelId]: data }));
      }
    } catch {
      // silently fail
    } finally {
      setLookupLoading(null);
    }
  }

  function toggleLookup(imovelId: string) {
    if (lookupResults[imovelId]) {
      setLookupOpen((prev) => ({ ...prev, [imovelId]: !prev[imovelId] }));
    } else {
      handleLookup(imovelId);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "#888" }}>
        Carregando...
      </div>
    );
  }

  if (lease.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <h2 style={{ color: "#111", marginBottom: 8 }}>
          Nenhum imovel distribuido hoje.
        </h2>
        <p style={{ color: "#888" }}>Volte amanha!</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 20 }}>
        Meus Imoveis do Dia
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
          gap: 20,
        }}
      >
        {lease.map((item) => {
          const im = item.imovel;
          if (!im) return null;
          const isMarking = marking === item.id;
          const propOpen = openPropForm === im.id;
          const propForm = propForms[im.id];

          return (
            <div
              key={item.id}
              style={{
                background: "#fff",
                borderRadius: 12,
                boxShadow: "0 2px 12px rgba(0,0,0,.05)",
                overflow: "hidden",
              }}
            >
              {im.images?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={im.images[0]}
                  alt={im.title}
                  style={{ width: "100%", height: 200, objectFit: "cover" }}
                />
              )}

              <div style={{ padding: 20 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#0a7c3a", marginBottom: 4 }}>
                  {im.price_formatted ?? "Preco sob consulta"}
                  {im.transaction_type === "rent" && (
                    <span style={{ fontSize: 11, color: "#666" }}> /mes</span>
                  )}
                </div>
                <div style={{ fontSize: 14, color: "#555", marginBottom: 12 }}>
                  {[im.neighborhood, im.city, im.state].filter(Boolean).join(" - ")}
                </div>

                <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#666", marginBottom: 16 }}>
                  {im.area != null && <span>{im.area} m2</span>}
                  {im.bedrooms != null && <span>{im.bedrooms} quartos</span>}
                  {im.bathrooms != null && <span>{im.bathrooms} banh.</span>}
                  {im.parking_spaces != null && <span>{im.parking_spaces} vagas</span>}
                </div>

                <a
                  href={im.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, color: "#0a7c3a", display: "inline-block", marginBottom: 16 }}
                >
                  Ver anuncio original
                </a>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {OUTCOMES.map((o) => (
                    <button
                      key={o.value}
                      disabled={isMarking}
                      onClick={() => handleMark(item.id, o.value)}
                      style={{
                        fontSize: 13,
                        padding: "7px 14px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: o.value === "descartado" ? "#f5f5f5" : "#fff",
                        color:
                          o.value === "agendou_visita"
                            ? "#0a7c3a"
                            : o.value === "descartado"
                              ? "#999"
                              : "#333",
                        cursor: isMarking ? "wait" : "pointer",
                        opacity: isMarking ? 0.6 : 1,
                        fontWeight: o.value === "agendou_visita" ? 600 : 400,
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => toggleLookup(im.id)}
                    disabled={lookupLoading === im.id}
                    style={{
                      fontSize: 13,
                      padding: "7px 14px",
                      borderRadius: 8,
                      border: "1px solid #0a7c3a",
                      background: lookupOpen[im.id] ? "#e8f5e9" : "#fff",
                      color: "#0a7c3a",
                      cursor: lookupLoading === im.id ? "wait" : "pointer",
                      flex: 1,
                      fontWeight: 500,
                    }}
                  >
                    {lookupLoading === im.id
                      ? "Buscando..."
                      : lookupOpen[im.id]
                        ? "Ocultar Pesquisa"
                        : "Buscar Proprietario"}
                  </button>
                  <button
                    onClick={() => togglePropForm(im.id)}
                    style={{
                      fontSize: 13,
                      padding: "7px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: propOpen ? "#111" : "#0a7c3a",
                      color: "#fff",
                      cursor: "pointer",
                      flex: 1,
                    }}
                  >
                    {propOpen ? "Fechar" : "Registrar Proprietario"}
                  </button>
                </div>

                {lookupOpen[im.id] && lookupResults[im.id] && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 16,
                      background: "#f0f7f1",
                      borderRadius: 8,
                      border: "1px solid #c8e6c9",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1b5e20", marginBottom: 12 }}>
                      Resultado da Pesquisa
                    </div>

                    {lookupResults[im.id].cepData && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4 }}>
                          Endereco (via CEP)
                        </div>
                        <div style={{ fontSize: 13, color: "#333", background: "#fff", padding: 10, borderRadius: 6 }}>
                          {lookupResults[im.id].cepData!.logradouro}
                          {lookupResults[im.id].cepData!.complemento && `, ${lookupResults[im.id].cepData!.complemento}`}
                          <br />
                          {lookupResults[im.id].cepData!.bairro} - {lookupResults[im.id].cepData!.localidade}/{lookupResults[im.id].cepData!.uf}
                        </div>
                      </div>
                    )}

                    {lookupResults[im.id].cnpjData && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4 }}>
                          Dados do CNPJ
                        </div>
                        <div style={{ fontSize: 13, color: "#333", background: "#fff", padding: 10, borderRadius: 6 }}>
                          <strong>{lookupResults[im.id].cnpjData!.nome}</strong>
                          {lookupResults[im.id].cnpjData!.fantasia && (
                            <span style={{ color: "#666" }}> ({lookupResults[im.id].cnpjData!.fantasia})</span>
                          )}
                          <br />
                          <span style={{ fontSize: 12, color: "#666" }}>
                            Situacao: {lookupResults[im.id].cnpjData!.situacao}
                          </span>
                          {lookupResults[im.id].cnpjData!.socios.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Socios:</span>
                              {lookupResults[im.id].cnpjData!.socios.map((s, i) => (
                                <div key={i} style={{ fontSize: 12, color: "#444", paddingLeft: 8 }}>
                                  {s.nome} <span style={{ color: "#888" }}>({s.qual})</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {lookupResults[im.id].cartorioHint && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4 }}>
                          Cartorio Competente
                        </div>
                        <div style={{ fontSize: 13, color: "#333", background: "#fff", padding: 10, borderRadius: 6 }}>
                          {lookupResults[im.id].cartorioHint}
                        </div>
                      </div>
                    )}

                    {lookupResults[im.id].iptuUrl && (
                      <div style={{ marginBottom: 12 }}>
                        <a
                          href={lookupResults[im.id].iptuUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 13,
                            color: "#0a7c3a",
                            fontWeight: 500,
                            textDecoration: "underline",
                          }}
                        >
                          Consultar IPTU - Porto Alegre (SMF)
                        </a>
                      </div>
                    )}

                    {lookupResults[im.id].suggestions.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4 }}>
                          Sugestoes para o corretor
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#444" }}>
                          {lookupResults[im.id].suggestions.map((s, i) => (
                            <li key={i} style={{ marginBottom: 4 }}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {propOpen && propForm && (
                  <div style={{ marginTop: 12, padding: 16, background: "#f9f9f9", borderRadius: 8 }}>
                    <div style={{ display: "grid", gap: 10 }}>
                      <input placeholder="Nome" value={propForm.nome} onChange={(e) => updateField(im.id, "nome", e.target.value)} style={inputStyle} />
                      <input placeholder="Telefone" value={propForm.telefone} onChange={(e) => updateField(im.id, "telefone", e.target.value)} style={inputStyle} />
                      <input placeholder="Email" type="email" value={propForm.email} onChange={(e) => updateField(im.id, "email", e.target.value)} style={inputStyle} />
                      <input placeholder="CPF / CNPJ" value={propForm.cpf_cnpj} onChange={(e) => updateField(im.id, "cpf_cnpj", e.target.value)} style={inputStyle} />
                      <select value={propForm.origem} onChange={(e) => updateField(im.id, "origem", e.target.value)} style={inputStyle}>
                        {ORIGENS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <textarea placeholder="Notas" value={propForm.notas} onChange={(e) => updateField(im.id, "notas", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
                      <button
                        onClick={() => handleSaveProp(im.id)}
                        disabled={savingProp}
                        style={{
                          padding: "9px 16px",
                          borderRadius: 8,
                          border: "none",
                          background: "#0a7c3a",
                          color: "#fff",
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: savingProp ? "wait" : "pointer",
                        }}
                      >
                        {savingProp ? "Salvando..." : "Salvar Proprietario"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid #ddd",
  fontSize: 14,
  background: "#fff",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
