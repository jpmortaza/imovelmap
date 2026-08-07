"use client";

import { useCallback, useEffect, useState } from "react";
import Territorio from "./territorio";

type Corretor = {
  id: string;
  email: string | null;
  nome: string | null;
  role: string;
  ativo: boolean;
  cota_diaria: number;
  cidade: string | null;
  bairros: string[] | null;
  created_at: string;
};

export default function CorretoresPage() {
  const [lista, setLista] = useState<Corretor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [role, setRole] = useState("corretor");
  const [cota, setCota] = useState("10");
  const [cidade, setCidade] = useState("");
  const [bairros, setBairros] = useState<string[]>([]);
  // território de quem já existe, editado direto na linha da tabela
  const [editando, setEditando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/admin/corretores");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setLista(j.corretores ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "erro ao carregar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setMsg(null);
    setLink(null);
    try {
      const r = await fetch("/api/admin/corretores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, nome, role, cota_diaria: Number(cota), cidade, bairros
        })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg(`Conta criada para ${j.email}.`);
      setLink(j.link ?? null);
      setEmail("");
      setNome("");
      setCidade("");
      setBairros([]);
      await carregar();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "erro");
    } finally {
      setSalvando(false);
    }
  }

  async function alterar(id: string, campos: Record<string, unknown>) {
    setMsg(null);
    try {
      const r = await fetch("/api/admin/corretores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...campos })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      await carregar();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "erro");
    }
  }

  async function novoLink(emailAlvo: string) {
    setMsg(null);
    setLink(null);
    try {
      const r = await fetch("/api/admin/corretores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailAlvo })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setLink(j.link);
      setMsg(`Link de acesso gerado para ${emailAlvo} — uso único, 1 hora.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "erro");
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 6 }}>Corretores</h1>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>
        Criar conta não define senha: o novo corretor recebe um link de uso
        único e escolhe a própria senha no primeiro acesso.
      </p>

      <form onSubmit={criar} style={cartao}>
        <h2 style={h2}>Novo corretor</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Campo r="E-mail" larg={230}>
            <input
              required type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="corretor@imobiliaria.com.br" style={input}
            />
          </Campo>
          <Campo r="Nome" larg={190}>
            <input value={nome} onChange={(e) => setNome(e.target.value)} style={input} />
          </Campo>
          <Campo r="Papel" larg={150}>
            <select value={role} onChange={(e) => setRole(e.target.value)} style={input}>
              <option value="corretor">Corretor</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super admin</option>
            </select>
          </Campo>
          <Campo r="Cota/dia" larg={90}>
            <input type="number" min={0} max={500} value={cota}
              onChange={(e) => setCota(e.target.value)} style={input} />
          </Campo>
        </div>

        {/* ⭐ Território já no cadastro: sem cidade e bairro o corretor entra
            e o painel dele não tem o que mostrar. */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f0f0f0" }}>
          <div style={{ fontSize: 12.5, color: "#666", marginBottom: 8 }}>
            <b>Território</b> — é o que ele vê ao entrar: o bairro inteiro, com
            mapa, quanto já é nosso e quanto é oportunidade.
          </div>
          <Territorio
            cidade={cidade}
            bairros={bairros}
            onChange={(c, b) => {
              setCidade(c);
              setBairros(b);
            }}
            compacto
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <button type="submit" disabled={salvando} style={btn}>
            {salvando ? "criando…" : "Criar conta"}
          </button>
        </div>
      </form>

      {msg && <div style={caixaMsg}>{msg}</div>}
      {link && (
        <div style={caixaLink}>
          <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.8 }}>
            Link de uso único — envie para a pessoa. Expira em 1 hora.
          </div>
          <code style={{ fontSize: 11.5, wordBreak: "break-all" }}>{link}</code>
          <div>
            <button
              onClick={() => navigator.clipboard?.writeText(link)}
              style={{ ...btnSec, marginTop: 8 }}
            >
              copiar link
            </button>
          </div>
        </div>
      )}

      <div style={{ ...cartao, padding: 0, overflow: "hidden" }}>
        {carregando ? (
          <div style={{ padding: 24, color: "#666" }}>carregando…</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ background: "#f6f7f9" }}>
              <tr>
                <Th>Corretor</Th><Th>Território</Th><Th>Papel</Th><Th>Cota</Th><Th>Estado</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} style={{ borderTop: "1px solid #eee" }}>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{c.nome ?? "—"}</div>
                    <div style={{ fontSize: 11.5, color: "#888" }}>{c.email}</div>
                  </Td>
                  <Td>
                    {editando === c.id ? (
                      <div style={{ minWidth: 300 }}>
                        <Territorio
                          cidade={c.cidade ?? ""}
                          bairros={c.bairros ?? []}
                          onChange={(cid, bs) => alterar(c.id, { cidade: cid, bairros: bs })}
                          compacto
                        />
                        <button onClick={() => setEditando(null)} style={{ ...btnSec, marginTop: 6 }}>
                          pronto
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setEditando(c.id)} style={btnSec}>
                        {c.bairros?.length
                          ? `${c.bairros.slice(0, 2).join(", ")}${c.bairros.length > 2 ? ` +${c.bairros.length - 2}` : ""}`
                          : "definir bairro"}
                      </button>
                    )}
                  </Td>
                  <Td>
                    <select
                      value={c.role}
                      onChange={(e) => alterar(c.id, { role: e.target.value })}
                      style={{ ...input, padding: "5px 8px", fontSize: 12 }}
                    >
                      <option value="corretor">corretor</option>
                      <option value="admin">admin</option>
                      <option value="super_admin">super_admin</option>
                    </select>
                  </Td>
                  <Td>
                    <input
                      type="number" min={0} max={500} defaultValue={c.cota_diaria}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== c.cota_diaria) alterar(c.id, { cota_diaria: v });
                      }}
                      style={{ ...input, width: 70, padding: "5px 8px", fontSize: 12 }}
                    />
                  </Td>
                  <Td>
                    <button
                      onClick={() => alterar(c.id, { ativo: !c.ativo })}
                      style={{
                        ...pilula,
                        background: c.ativo ? "#e7f6ec" : "#eee",
                        color: c.ativo ? "#157f3c" : "#777"
                      }}
                    >
                      {c.ativo ? "ativo" : "inativo"}
                    </button>
                  </Td>
                  <Td>
                    {c.email && (
                      <button onClick={() => novoLink(c.email!)} style={btnSec}>
                        gerar acesso
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Campo({ r, larg, children }: { r: string; larg: number; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, width: larg }}>
      <span style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {r}
      </span>
      {children}
    </label>
  );
}
const Th = ({ children }: { children?: React.ReactNode }) => (
  <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, color: "#666", fontWeight: 600 }}>
    {children}
  </th>
);
const Td = ({ children }: { children?: React.ReactNode }) => (
  <td style={{ padding: "10px 12px" }}>{children}</td>
);

const cartao: React.CSSProperties = {
  background: "#fff", borderRadius: 12, padding: 18,
  marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,.05)"
};
const h2: React.CSSProperties = { fontSize: 14, margin: "0 0 12px" };
const input: React.CSSProperties = {
  padding: "8px 10px", border: "1px solid #ddd", borderRadius: 7,
  fontSize: 13, outline: "none", width: "100%"
};
const btn: React.CSSProperties = {
  background: "#111", color: "#fff", border: 0, borderRadius: 8,
  padding: "9px 16px", fontSize: 13, cursor: "pointer"
};
const btnSec: React.CSSProperties = {
  background: "#fff", color: "#333", border: "1px solid #ddd", borderRadius: 7,
  padding: "6px 10px", fontSize: 12, cursor: "pointer"
};
const pilula: React.CSSProperties = {
  border: 0, borderRadius: 999, padding: "4px 12px",
  fontSize: 11, fontWeight: 700, cursor: "pointer"
};
const caixaMsg: React.CSSProperties = {
  background: "#eef2ff", color: "#3b4ec2", borderRadius: 8,
  padding: "10px 14px", fontSize: 13, marginBottom: 12
};
const caixaLink: React.CSSProperties = {
  background: "#11161d", color: "#d7e3f0", borderRadius: 10,
  padding: 14, marginBottom: 14
};
