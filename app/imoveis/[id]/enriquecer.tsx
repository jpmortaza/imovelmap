"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Onde moram os "dados adicionais":
//   EF `dossie`            → grupo cross-portal, histórico de preço, cartório
//                            do bairro, CNPJ via BrasilAPI, próximos passos
//   EF `resolver-endereco` → cerco Overpass + filtro IPTU quando o anúncio
//                            não publica o endereço
//   tabela `proprietarios` → o que o corretor levanta, isolado por RLS

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Props = {
  imovelId: string;
  source: string;
  externalId: string;
  temEndereco: boolean;
  temCoordenada: boolean;
};

export default function Enriquecer({
  imovelId,
  temEndereco,
  temCoordenada
}: Props) {
  const [dossie, setDossie] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [resolvendo, setResolvendo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [prop, setProp] = useState<any>({
    nome: "",
    telefone: "",
    email: "",
    cpf_cnpj: "",
    origem: "internet",
    notas: ""
  });
  const [salvando, setSalvando] = useState(false);

  const chamarEF = useCallback(async (nome: string, corpo: unknown) => {
    const supabase = createClient();
    const {
      data: { session }
    } = await supabase.auth.getSession();
    if (!session) throw new Error("sessão expirada — faça login de novo");

    const r = await fetch(`${SUPABASE_URL}/functions/v1/${nome}`, {
      method: "POST",
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(corpo)
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
    return j;
  }, []);

  const carregarDossie = useCallback(async () => {
    setCarregando(true);
    try {
      const d = await chamarEF("dossie", { imovelId });
      setDossie(d);
      if (d?.proprietario) setProp({ ...prop, ...d.proprietario });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "erro ao carregar dossiê");
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chamarEF, imovelId]);

  useEffect(() => {
    carregarDossie();
  }, [carregarDossie]);

  async function resolverEndereco() {
    setResolvendo(true);
    setMsg(null);
    try {
      const r = await chamarEF("resolver-endereco", { imovelId, forcar: true });
      if (r.resolvido) {
        setMsg(
          `Endereço encontrado: ${r.endereco}${r.numero ? ", " + r.numero : ""} ` +
            `(confiança ${r.confianca}%, ${r.metodo}). Recarregue para ver.`
        );
      } else {
        setMsg(
          r.motivo ??
            `Não deu para resolver. ${r.passo1?.candidatos ?? 0} prédios no raio, ` +
              `${r.passo1?.comEnderecoCompleto ?? 0} com endereço no OSM.`
        );
      }
      await carregarDossie();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "erro");
    } finally {
      setResolvendo(false);
    }
  }

  async function consultarCnpj() {
    const doc = String(prop.cpf_cnpj ?? "").replace(/\D/g, "");
    if (doc.length !== 14) {
      setMsg("Informe um CNPJ com 14 dígitos para consultar.");
      return;
    }
    setMsg("consultando BrasilAPI…");
    try {
      const r = await chamarEF("dossie", { cnpj: doc });
      const c = r.cnpj;
      if (c?.erro) {
        setMsg(`CNPJ: ${c.erro}`);
        return;
      }
      setDossie((d: any) => ({ ...(d ?? {}), cnpj: c }));
      setProp((p: any) => ({ ...p, nome: p.nome || c.razaoSocial || "" }));
      setMsg(`Encontrado: ${c.razaoSocial} · ${c.socios?.length ?? 0} sócio(s)`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "erro");
    }
  }

  async function salvarProprietario() {
    setSalvando(true);
    setMsg(null);
    try {
      const r = await fetch("/api/painel/proprietario", {
        method: prop.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...prop, imovelId })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "erro ao salvar");
      setProp(j.proprietario ?? prop);
      setMsg("Proprietário salvo.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "erro");
    } finally {
      setSalvando(false);
    }
  }

  const precos = dossie?.precos ?? [];
  const grupo = dossie?.grupo ?? [];

  return (
    <>
      {/* ---------------------------------------------- dados adicionais */}
      <section style={cartao}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <h2 style={{ ...h2, margin: 0, flex: 1 }}>🔎 Dados adicionais</h2>
          <button onClick={carregarDossie} style={btnSec} disabled={carregando}>
            {carregando ? "buscando…" : "atualizar"}
          </button>
        </div>

        {!temEndereco && (
          <div style={caixaAlerta}>
            <div style={{ flex: 1 }}>
              <b>Este anúncio não publica o endereço.</b>
              <div style={{ fontSize: 12.5, marginTop: 3 }}>
                {temCoordenada
                  ? "Dá para descobrir cruzando a coordenada com os prédios do OpenStreetMap e o cadastro do IPTU."
                  : "Sem coordenada no anúncio não há como cercar — precisa de captura mais completa."}
              </div>
            </div>
            <button onClick={resolverEndereco} disabled={resolvendo || !temCoordenada} style={btn}>
              {resolvendo ? "procurando…" : "Descobrir endereço"}
            </button>
          </div>
        )}

        {dossie?.portais > 1 && (
          <div style={{ marginBottom: 12 }}>
            <div style={rotulo}>Também anunciado em</div>
            <div style={{ fontWeight: 700 }}>
              {[...new Set(grupo.map((g: any) => g.source))].join(" · ")}
            </div>
            {new Set(
              [...grupo.map((g: any) => Number(g.price))].filter(Boolean)
            ).size > 1 && (
              <div style={{ color: "#b00020", fontWeight: 700, fontSize: 13, marginTop: 3 }}>
                preços diferentes entre portais → provável que NÃO haja exclusiva
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              {grupo.map((g: any) => (
                <div key={g.id} style={{ fontSize: 12.5, color: "#555" }}>
                  {g.source}: {g.price ? `R$ ${Number(g.price).toLocaleString("pt-BR")}` : "—"}{" "}
                  <a href={g.url} target="_blank" rel="noreferrer" style={{ color: "#0366d6" }}>
                    ver
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {precos.length > 1 && (
          <div style={{ marginBottom: 12 }}>
            <div style={rotulo}>Histórico de preço</div>
            {dossie.quedaPct > 0 && (
              <div style={{ color: "#c2410c", fontWeight: 700 }}>
                caiu {dossie.quedaPct}% — de R$ {Number(dossie.precoPico).toLocaleString("pt-BR")}{" "}
                para R$ {Number(dossie.precoAtual).toLocaleString("pt-BR")}
              </div>
            )}
            <div style={{ marginTop: 6 }}>
              {precos.map((p: any, i: number) => (
                <div key={i} style={{ fontSize: 12.5, color: "#555" }}>
                  {new Date(p.quando).toLocaleDateString("pt-BR")} · {p.source} · R${" "}
                  {Number(p.price).toLocaleString("pt-BR")}
                </div>
              ))}
            </div>
          </div>
        )}

        {dossie?.cartorio && (
          <div style={{ marginBottom: 12 }}>
            <div style={rotulo}>Cartório para pedir a matrícula</div>
            <div style={{ fontWeight: 600 }}>{dossie.cartorio}</div>
            <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>
              É a matrícula que traz nome e CPF do dono. Custa ~R$ 50–100.
            </div>
          </div>
        )}

        {dossie?.iptuUrl && (
          <a href={dossie.iptuUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#0366d6" }}>
            consultar IPTU na prefeitura →
          </a>
        )}

        {Array.isArray(dossie?.proximosPassos) && dossie.proximosPassos.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #eee" }}>
            <div style={rotulo}>O que falta para fechar o cerco</div>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, color: "#555" }}>
              {dossie.proximosPassos.map((p: string, i: number) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------- proprietário */}
      <section style={cartao}>
        <h2 style={h2}>🕵️ Proprietário</h2>

        {dossie?.cnpj?.razaoSocial && (
          <div style={{ background: "#f0f5ff", borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <b>{dossie.cnpj.razaoSocial}</b>
            {dossie.cnpj.nomeFantasia ? ` · ${dossie.cnpj.nomeFantasia}` : ""}
            <div style={{ fontSize: 12.5, color: "#555", marginTop: 4 }}>
              {dossie.cnpj.situacao} · {dossie.cnpj.atividade}
            </div>
            {dossie.cnpj.telefone && (
              <div style={{ fontSize: 12.5, marginTop: 2 }}>tel: {dossie.cnpj.telefone}</div>
            )}
            {dossie.cnpj.socios?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={rotulo}>Quadro societário</div>
                {dossie.cnpj.socios.map((s: any, i: number) => (
                  <div key={i} style={{ fontSize: 12.5 }}>
                    {s.nome} — {s.qualificacao}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={formGrade}>
          <Campo rotulo="Nome" v={prop.nome} set={(x) => setProp({ ...prop, nome: x })} />
          <Campo rotulo="Telefone" v={prop.telefone} set={(x) => setProp({ ...prop, telefone: x })} />
          <Campo rotulo="E-mail" v={prop.email} set={(x) => setProp({ ...prop, email: x })} />
          <div>
            <label style={rotulo}>CPF / CNPJ</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={prop.cpf_cnpj ?? ""}
                onChange={(e) => setProp({ ...prop, cpf_cnpj: e.target.value })}
                style={input}
              />
              <button onClick={consultarCnpj} style={btnSec} title="Consulta o CNPJ na BrasilAPI">
                buscar
              </button>
            </div>
          </div>
          <div>
            <label style={rotulo}>Origem</label>
            <select
              value={prop.origem ?? "internet"}
              onChange={(e) => setProp({ ...prop, origem: e.target.value })}
              style={input}
            >
              <option value="matricula">Matrícula</option>
              <option value="vizinho">Vizinho</option>
              <option value="portaria">Portaria</option>
              <option value="internet">Internet</option>
              <option value="anuncio">Próprio anúncio</option>
              <option value="outro">Outro</option>
            </select>
          </div>
        </div>

        <label style={{ ...rotulo, display: "block", marginTop: 12 }}>Notas</label>
        <textarea
          value={prop.notas ?? ""}
          onChange={(e) => setProp({ ...prop, notas: e.target.value })}
          rows={3}
          style={{ ...input, width: "100%", fontFamily: "inherit" }}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <button onClick={salvarProprietario} disabled={salvando} style={btn}>
            {salvando ? "salvando…" : "Salvar proprietário"}
          </button>
          <span style={{ fontSize: 12.5, color: "#777" }}>
            só você enxerga — isolado por RLS
          </span>
        </div>
      </section>

      {msg && <div style={caixaMsg}>{msg}</div>}
    </>
  );
}

function Campo({ rotulo: r, v, set }: { rotulo: string; v: string; set: (x: string) => void }) {
  return (
    <div>
      <label style={rotulo}>{r}</label>
      <input value={v ?? ""} onChange={(e) => set(e.target.value)} style={input} />
    </div>
  );
}

const cartao: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 18,
  marginBottom: 14,
  boxShadow: "0 1px 4px rgba(0,0,0,.06)"
};
const h2: React.CSSProperties = { fontSize: 14, margin: "0 0 12px", color: "#333" };
const rotulo: React.CSSProperties = {
  fontSize: 11,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: 0.4,
  marginBottom: 3
};
const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ddd",
  borderRadius: 7,
  fontSize: 13,
  outline: "none"
};
const formGrade: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12
};
const btn: React.CSSProperties = {
  background: "#111",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  padding: "9px 15px",
  fontSize: 13,
  cursor: "pointer"
};
const btnSec: React.CSSProperties = {
  background: "#fff",
  color: "#333",
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12.5,
  cursor: "pointer"
};
const caixaAlerta: React.CSSProperties = {
  background: "#fff7e0",
  borderRadius: 8,
  padding: 12,
  marginBottom: 14,
  display: "flex",
  gap: 12,
  alignItems: "center",
  color: "#6b5200"
};
const caixaMsg: React.CSSProperties = {
  background: "#11161d",
  color: "#d7e3f0",
  borderRadius: 10,
  padding: "12px 14px",
  fontSize: 13,
  marginBottom: 14
};
