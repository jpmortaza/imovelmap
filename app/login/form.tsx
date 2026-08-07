"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginForm() {
  const router = useRouter();
  // o middleware guarda em `de` a rota que a pessoa tentou abrir antes de
  // cair aqui; so aceitamos caminho interno, para nao virar open redirect
  const sp = useSearchParams();
  const de = sp.get("de");
  const destino = de && de.startsWith("/") && !de.startsWith("//") ? de : "/painel";
  // O client so nasce quando o usuario envia o formulario. Criar no corpo do
  // componente faz o prerender do build exigir as env vars — e o build quebra
  // se elas nao estiverem disponiveis naquele instante.
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) setError(error.message);
      else router.push(destino);
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nome } }
      });
      if (error) setError(error.message);
      else setError("Conta criada! Verifique seu email para confirmar.");
    }

    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#fff",
          padding: 32,
          borderRadius: 12,
          boxShadow: "0 4px 24px rgba(0,0,0,.06)",
          display: "flex",
          flexDirection: "column",
          gap: 12
        }}
      >
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>ImovelMap</h1>
        <p style={{ color: "#666", marginBottom: 8 }}>
          {mode === "signin" ? "Entre na sua conta" : "Crie sua conta"}
        </p>

        {mode === "signup" && (
          <input
            type="text"
            placeholder="Nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            style={inputStyle}
          />
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          style={inputStyle}
        />

        {error && (
          <div
            style={{
              color: "#b00020",
              fontSize: 14,
              padding: 8,
              background: "#fdecea",
              borderRadius: 6
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            background: "#111",
            color: "#fff",
            border: 0,
            padding: "12px 16px",
            borderRadius: 8,
            fontSize: 16,
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading
            ? "..."
            : mode === "signin"
            ? "Entrar"
            : "Criar conta"}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          style={{
            background: "none",
            border: 0,
            color: "#0366d6",
            fontSize: 14,
            marginTop: 4
          }}
        >
          {mode === "signin"
            ? "Não tem conta? Criar uma"
            : "Já tem conta? Entrar"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  border: "1px solid #ddd",
  borderRadius: 8,
  fontSize: 16,
  outline: "none"
};
