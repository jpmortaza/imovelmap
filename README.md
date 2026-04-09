# Superag

Plataforma para corretores fazerem agenciamento de imóveis: busca de imóveis na cidade, alertas de novos anúncios, login individual por corretor.

## Stack
- Next.js 14 (App Router) + TypeScript
- Supabase (Auth + Postgres + RLS)
- Deploy: Vercel

## Setup local
```bash
cp .env.local.example .env.local
npm install
npm run dev
```

## Banco de dados
Rodar o arquivo `../supabase/schema.sql` no SQL Editor do Supabase
(projeto `wtpbewcneuxicnxyoppj`).

## Variáveis de ambiente
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (somente backend / scraper)
