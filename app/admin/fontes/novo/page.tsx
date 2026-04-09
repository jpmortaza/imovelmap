"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NovaFontePage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("apify");
  const [urlBase, setUrlBase] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [cron, setCron] = useState("");
  const [configStr, setConfigStr] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const config = JSON.parse(configStr);
      const supabase = createClient();
      const { error } = await supabase.from("fontes").insert({
        slug,
        nome,
        tipo,
        url_base: urlBase || null,
        cidade: cidade || null,
        estado: estado || null,
        cron: cron || null,
        config
      });
      if (error) throw error;
      router.push("/admin/fontes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Nova fonte</h1>
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#fff",
          padding: 24,
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12
        }}
      >
        <Field label="Slug (único)">
          <input required value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="olx-poa" style={inputStyle} />
        </Field>
        <Field label="Nome">
          <input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="OLX Imóveis - Porto Alegre" style={inputStyle} />
        </Field>
        <Field label="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={inputStyle}>
            <option value="apify">Apify (actor)</option>
            <option value="custom_http">Custom HTTP scraper</option>
            <option value="scrapfly">Scrapfly</option>
            <option value="rss">RSS</option>
            <option value="other">Outro</option>
          </select>
        </Field>
        <Field label="URL base">
          <input value={urlBase} onChange={(e) => setUrlBase(e.target.value)} placeholder="https://..." style={inputStyle} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <Field label="Cidade">
            <input value={cidade} onChange={(e) => setCidade(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Estado">
            <input value={estado} onChange={(e) => setEstado(e.target.value)} maxLength={2} style={inputStyle} />
          </Field>
        </div>
        <Field label="Cron (opcional, ex: '0 */6 * * *')">
          <input value={cron} onChange={(e) => setCron(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Config (JSON)">
          <textarea
            value={configStr}
            onChange={(e) => setConfigStr(e.target.value)}
            rows={6}
            style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", fontSize: 13 }}
          />
        </Field>

        {error && (
          <div style={{ color: "#b00020", padding: 10, background: "#fdecea", borderRadius: 6, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            type="submit"
            disabled={busy}
            style={{
              background: "#111",
              color: "#fff",
              border: 0,
              padding: "10px 18px",
              borderRadius: 8,
              fontSize: 14
            }}
          >
            {busy ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            style={{ background: "#fff", border: "1px solid #ddd", padding: "10px 18px", borderRadius: 8, fontSize: 14 }}
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 13, color: "#444" }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: 8,
  fontSize: 14,
  outline: "none"
};
