"use client";

import { useEffect, useState, useCallback } from "react";

interface Alerta {
  id: string;
  nome: string;
  city?: string;
  neighborhood?: string;
  transaction_type?: string;
  property_type?: string;
  price_min?: number;
  price_max?: number;
  area_min?: number;
  area_max?: number;
  bedrooms_min?: number;
  bathrooms_min?: number;
  parking_min?: number;
  ativo: boolean;
}

const emptyAlerta: Omit<Alerta, "id"> = {
  nome: "",
  city: "",
  neighborhood: "",
  transaction_type: "",
  property_type: "",
  price_min: undefined,
  price_max: undefined,
  area_min: undefined,
  area_max: undefined,
  bedrooms_min: undefined,
  bathrooms_min: undefined,
  parking_min: undefined,
  ativo: true
};

export default function AlertasPage() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Alerta, "id">>(emptyAlerta);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchAlertas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/painel/alertas");
      const data = await res.json();
      setAlertas(data.items || data.alertas || []);
    } catch {
      setAlertas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlertas();
  }, [fetchAlertas]);

  function openNewForm() {
    setForm({ ...emptyAlerta });
    setEditingId(null);
    setShowForm(true);
  }

  function openEditForm(alerta: Alerta) {
    const { id, ...rest } = alerta;
    setForm(rest);
    setEditingId(id);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const method = editingId ? "PUT" : "POST";
      const body = editingId ? { ...form, id: editingId } : form;
      await fetch("/api/painel/alertas", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      closeForm();
      await fetchAlertas();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await fetch("/api/painel/alertas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      setAlertas((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  async function handleToggle(alerta: Alerta) {
    await fetch("/api/painel/alertas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: alerta.id, ativo: !alerta.ativo })
    });
    setAlertas((prev) =>
      prev.map((a) =>
        a.id === alerta.id ? { ...a, ativo: !a.ativo } : a
      )
    );
  }

  function setField(field: string, value: string | number | boolean | undefined) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function numOrUndef(v: string): number | undefined {
    const n = Number(v);
    return v === "" || isNaN(n) ? undefined : n;
  }

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "#888" }}>
        Carregando alertas...
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>
          Alertas
        </h1>
        <button
          onClick={openNewForm}
          style={{
            fontSize: 14,
            padding: "9px 18px",
            borderRadius: 8,
            border: "none",
            background: "#0a7c3a",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600
          }}
        >
          Novo alerta
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 2px 12px rgba(0,0,0,.05)",
            padding: 24,
            marginBottom: 24
          }}
        >
          <h2
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: "#111",
              marginBottom: 16
            }}
          >
            {editingId ? "Editar alerta" : "Novo alerta"}
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 12
            }}
          >
            <div>
              <label style={labelStyle}>Nome do alerta</label>
              <input
                value={form.nome}
                onChange={(e) => setField("nome", e.target.value)}
                style={inputStyle}
                placeholder="Ex: Aptos Moinhos 2D"
              />
            </div>
            <div>
              <label style={labelStyle}>Cidade</label>
              <input
                value={form.city || ""}
                onChange={(e) => setField("city", e.target.value)}
                style={inputStyle}
                placeholder="Porto Alegre"
              />
            </div>
            <div>
              <label style={labelStyle}>Bairro</label>
              <input
                value={form.neighborhood || ""}
                onChange={(e) => setField("neighborhood", e.target.value)}
                style={inputStyle}
                placeholder="Moinhos de Vento"
              />
            </div>
            <div>
              <label style={labelStyle}>Tipo de transacao</label>
              <select
                value={form.transaction_type || ""}
                onChange={(e) => setField("transaction_type", e.target.value)}
                style={inputStyle}
              >
                <option value="">Todos</option>
                <option value="venda">Venda</option>
                <option value="aluguel">Aluguel</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Tipo de imovel</label>
              <select
                value={form.property_type || ""}
                onChange={(e) => setField("property_type", e.target.value)}
                style={inputStyle}
              >
                <option value="">Todos</option>
                <option value="apartamento">Apartamento</option>
                <option value="casa">Casa</option>
                <option value="comercial">Comercial</option>
                <option value="terreno">Terreno</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Preco minimo</label>
              <input
                type="number"
                value={form.price_min ?? ""}
                onChange={(e) => setField("price_min", numOrUndef(e.target.value))}
                style={inputStyle}
                placeholder="0"
              />
            </div>
            <div>
              <label style={labelStyle}>Preco maximo</label>
              <input
                type="number"
                value={form.price_max ?? ""}
                onChange={(e) => setField("price_max", numOrUndef(e.target.value))}
                style={inputStyle}
                placeholder="1000000"
              />
            </div>
            <div>
              <label style={labelStyle}>Area minima (m2)</label>
              <input
                type="number"
                value={form.area_min ?? ""}
                onChange={(e) => setField("area_min", numOrUndef(e.target.value))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Area maxima (m2)</label>
              <input
                type="number"
                value={form.area_max ?? ""}
                onChange={(e) => setField("area_max", numOrUndef(e.target.value))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Quartos (min)</label>
              <input
                type="number"
                value={form.bedrooms_min ?? ""}
                onChange={(e) =>
                  setField("bedrooms_min", numOrUndef(e.target.value))
                }
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Banheiros (min)</label>
              <input
                type="number"
                value={form.bathrooms_min ?? ""}
                onChange={(e) =>
                  setField("bathrooms_min", numOrUndef(e.target.value))
                }
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Vagas (min)</label>
              <input
                type="number"
                value={form.parking_min ?? ""}
                onChange={(e) =>
                  setField("parking_min", numOrUndef(e.target.value))
                }
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              onClick={handleSave}
              disabled={saving || !form.nome.trim()}
              style={{
                padding: "9px 20px",
                borderRadius: 8,
                border: "none",
                background: "#0a7c3a",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: saving ? "wait" : "pointer",
                opacity: saving || !form.nome.trim() ? 0.6 : 1
              }}
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              onClick={closeForm}
              style={{
                padding: "9px 20px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "#fff",
                color: "#333",
                fontSize: 14,
                cursor: "pointer"
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {alertas.length === 0 && !showForm ? (
        <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
          <p>Nenhum alerta configurado.</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>
            Crie alertas para ser notificado quando novos imoveis surgirem.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {alertas.map((alerta) => {
            const isDeleting = deleting === alerta.id;
            const filters: string[] = [];
            if (alerta.city) filters.push(alerta.city);
            if (alerta.neighborhood) filters.push(alerta.neighborhood);
            if (alerta.transaction_type) filters.push(alerta.transaction_type);
            if (alerta.property_type) filters.push(alerta.property_type);
            if (alerta.bedrooms_min)
              filters.push(`${alerta.bedrooms_min}+ quartos`);
            if (alerta.price_min || alerta.price_max) {
              const min = alerta.price_min
                ? `R$ ${(alerta.price_min / 1000).toFixed(0)}k`
                : "0";
              const max = alerta.price_max
                ? `R$ ${(alerta.price_max / 1000).toFixed(0)}k`
                : "+";
              filters.push(`${min} - ${max}`);
            }

            return (
              <div
                key={alerta.id}
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  boxShadow: "0 2px 12px rgba(0,0,0,.05)",
                  padding: 20,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  opacity: alerta.ativo ? 1 : 0.55
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: "#111",
                      marginBottom: 4
                    }}
                  >
                    {alerta.nome}
                  </div>
                  <div style={{ fontSize: 13, color: "#888" }}>
                    {filters.length > 0
                      ? filters.join(" / ")
                      : "Sem filtros definidos"}
                  </div>
                </div>

                <button
                  onClick={() => handleToggle(alerta)}
                  style={{
                    fontSize: 12,
                    padding: "5px 12px",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    background: alerta.ativo ? "#0a7c3a" : "#eee",
                    color: alerta.ativo ? "#fff" : "#888",
                    cursor: "pointer"
                  }}
                >
                  {alerta.ativo ? "Ativo" : "Inativo"}
                </button>

                <button
                  onClick={() => openEditForm(alerta)}
                  style={{
                    fontSize: 12,
                    padding: "5px 12px",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    background: "#fff",
                    color: "#333",
                    cursor: "pointer"
                  }}
                >
                  Editar
                </button>

                <button
                  onClick={() => handleDelete(alerta.id)}
                  disabled={isDeleting}
                  style={{
                    fontSize: 12,
                    padding: "5px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "#e53e3e",
                    color: "#fff",
                    cursor: isDeleting ? "wait" : "pointer",
                    opacity: isDeleting ? 0.6 : 1
                  }}
                >
                  {isDeleting ? "..." : "Excluir"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#888",
  marginBottom: 4
};

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid #ddd",
  fontSize: 14,
  background: "#fff",
  outline: "none",
  width: "100%",
  boxSizing: "border-box"
};
