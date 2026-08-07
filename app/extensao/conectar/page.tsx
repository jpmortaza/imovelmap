"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ID da extensao publicada. Definir em NEXT_PUBLIC_EXTENSAO_ID.
// Enquanto roda em modo desenvolvedor o ID muda a cada carga, entao
// a extensao tambem escuta o evento de janela como fallback.
const EXTENSAO_ID = process.env.NEXT_PUBLIC_EXTENSAO_ID ?? "";

type Estado = "verificando" | "sem-login" | "enviando" | "ok" | "sem-extensao";

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage: (
          id: string,
          msg: unknown,
          cb: (resp?: { ok?: boolean }) => void
        ) => void;
        lastError?: { message: string };
      };
    };
  }
}

export default function ConectarPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("verificando");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        setEstado("sem-login");
        return;
      }

      setEmail(session.user.email ?? null);
      setEstado("enviando");

      const payload = {
        tipo: "IMOVELMAP_SESSAO",
        refresh_token: session.refresh_token,
        access_token: session.access_token,
        user_id: session.user.id,
        email: session.user.email,
        supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL
      };

      // Caminho 1: extensao publicada, ID conhecido (externally_connectable)
      if (EXTENSAO_ID && window.chrome?.runtime?.sendMessage) {
        window.chrome.runtime.sendMessage(EXTENSAO_ID, payload, (resp) => {
          if (window.chrome?.runtime?.lastError || !resp?.ok) {
            tentarViaEvento();
            return;
          }
          setEstado("ok");
        });
        return;
      }

      tentarViaEvento();

      // Caminho 2: modo desenvolvedor — o content script da extensao
      // escuta este evento na propria pagina e responde.
      function tentarViaEvento() {
        let respondeu = false;

        const aoConfirmar = () => {
          respondeu = true;
          setEstado("ok");
        };

        window.addEventListener("imovelmap:conectado", aoConfirmar, {
          once: true
        });
        window.dispatchEvent(
          new CustomEvent("imovelmap:conectar", { detail: payload })
        );

        setTimeout(() => {
          if (!respondeu) {
            window.removeEventListener("imovelmap:conectado", aoConfirmar);
            setEstado("sem-extensao");
          }
        }, 2500);
      }
    })();
  }, []);

  return (
    <div style={wrap}>
      <div style={caixa}>
        <Link href="/" style={logo}>
          ImovelMap
        </Link>

        {estado === "verificando" && (
          <p style={texto}>Verificando sua sessão...</p>
        )}

        {estado === "enviando" && (
          <p style={texto}>Conectando a extensão{email ? ` como ${email}` : ""}...</p>
        )}

        {estado === "ok" && (
          <>
            <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
            <h1 style={titulo}>Extensão conectada</h1>
            <p style={texto}>
              Pronto{email ? `, ${email}` : ""}. Pode fechar esta aba e voltar a
              navegar nos portais — os imóveis já começam a entrar no seu
              ImovelMap.
            </p>
            <Link href="/painel" style={btn}>
              Ir para o painel
            </Link>
          </>
        )}

        {estado === "sem-login" && (
          <>
            <div style={{ fontSize: 44, marginBottom: 8 }}>🔐</div>
            <h1 style={titulo}>Entre na sua conta</h1>
            <p style={texto}>
              Faça login para conectar a extensão. É a mesma conta que você usa
              no painel do corretor.
            </p>
            <button
              onClick={() =>
                router.push("/login?next=/extensao/conectar")
              }
              style={btn}
            >
              Entrar
            </button>
          </>
        )}

        {estado === "sem-extensao" && (
          <>
            <div style={{ fontSize: 44, marginBottom: 8 }}>🧩</div>
            <h1 style={titulo}>Extensão não encontrada</h1>
            <p style={texto}>
              Não achamos a extensão neste navegador. Instale primeiro e volte
              aqui para conectar.
            </p>
            <Link href="/extensao" style={btn}>
              Baixar a extensão
            </Link>
            <button
              onClick={() => window.location.reload()}
              style={btnSecundario}
            >
              Já instalei, tentar de novo
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "#f7f7f8",
  padding: 24
};

const caixa: React.CSSProperties = {
  width: "100%",
  maxWidth: 440,
  background: "#fff",
  padding: 40,
  borderRadius: 12,
  boxShadow: "0 4px 24px rgba(0,0,0,.06)",
  textAlign: "center",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10
};

const logo: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "#111",
  marginBottom: 12
};

const titulo: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700
};

const texto: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.6,
  color: "#666"
};

const btn: React.CSSProperties = {
  marginTop: 10,
  background: "#111",
  color: "#fff",
  border: 0,
  padding: "12px 20px",
  borderRadius: 8,
  fontSize: 15,
  cursor: "pointer"
};

const btnSecundario: React.CSSProperties = {
  background: "none",
  border: 0,
  color: "#0366d6",
  fontSize: 14,
  cursor: "pointer"
};
