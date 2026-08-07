# ImovelMap — contexto para o agente

> Leia `PROJETO.md` antes de qualquer coisa. Este arquivo é o estado operacional.
> Última atualização: 06/08/2026

---

## O que é

Plataforma de agenciamento de imóveis: mapa público + painel do corretor. O corretor
recebe uma cota diária de imóveis, descobre o endereço que o portal esconde, identifica
o proprietário e oferece agenciamento.

**Site:** imovelmap.com · superag.vercel.app
**Repo:** https://github.com/jpmortaza/imovelmap (Next.js 14 App Router, **público**)
**Vercel:** projeto `imovelmap`, team `team_HvRUGIod9WDS70QCgJYSjXCF`

---

## Estado atual (06/08/2026)

### ✅ Feito
- **Supabase novo criado:** `jmtrkygcndaqnrgobnqo` (org `mtz`, sa-east-1, $10/mês, ACTIVE_HEALTHY)
- `PROJETO.md` — plano completo em 12 fases
- `app/extensao/page.tsx` e `app/extensao/conectar/page.tsx` — páginas prontas, **ainda não commitadas**
- **Fase 2 — schema aplicado (05/08).** 14 tabelas em `public` + 4 em `publico`, RLS em
  todas, 6 RPCs, extensões postgis/vector/pg_trgm/pg_net/pg_cron. Migrations versionadas
  em `supabase/migrations/` — **desta vez o schema não se perde de novo**.
  Testado ponta a ponta com dois corretores; banco devolvido vazio depois.
- **Fase 3 — EF `ingerir` no ar (05/08).** `supabase/functions/ingerir/`, `verify_jwt=true`.
  Valida o JWT do corretor, normaliza apelido de chave e chama a RPC `ingerir_lote` —
  **um round-trip por lote**, com bloco de exceção por item. Loga em `capturas` e
  `extracoes`. Testado com token real: lote misto de 5 itens, 3 novos + 1 atualizado +
  1 descartado, 115ms.
- **Fase 4 — extensão v0.1 (05/08).** `extensao/`, MV3. Handoff de sessão pelo site,
  net-hook no MAIN world, engine + descriptors ZAP/VivaReal, fila IndexedDB, popup com
  permissão por portal. Cadeia testada de ponta a ponta com payload sintético da
  glue-api: JSON → engine → EF → banco, endereço completo incluído.
- **Fase 6 — extensão v0.2 (06/08).** Descriptors de OLX (`__NEXT_DATA__`), ImovelWeb e
  **genérico por JSON-LD** (qualquer imobiliária: `source` vira o hostname, autorizada
  site a site no popup). Sidepanel com a lista da sessão e modo varredura — que rola a
  página no ritmo de leitura e deixa a própria SPA pedir a próxima leva, **sem nenhuma
  requisição nossa**.
- **Fase 10 (parcial, 06/08).** `agrupar_duplicatas` liga anúncios do mesmo imóvel entre
  portais (endereço+número por trigrama, geo <150 m, ou CEP+área); `calcular_temperatura`
  passou a olhar o **grupo**, não o anúncio. EF `dossie` no ar: junta grupo, histórico de
  preço, cartório de POA por bairro e CNPJ via **BrasilAPI** (grátis, sem chave).
- **Fase 12 (parcial, 06/08).** `pg_cron`: `imovelmap-distribuir` 09:00 UTC (06:00 BRT) e
  `imovelmap-agrupar` de 2 em 2 horas. Não depende mais da rota cron da Vercel.
- **Fase 9 — HUD (06/08).** `extensao/core/hud.js`, shadow DOM (o CSS do portal não
  alcança). Só aparece em página de anúncio: o `idDaPagina` de cada descriptor tira o
  id da URL, e a EF `dossie` resolve `(source, externalId)` → imóvel. Mostra
  temperatura, endereço revelado, "N preços diferentes → SEM EXCLUSIVA", queda de
  preço **do grupo** e cartório. Anúncio ainda não capturado devolve
  `mapeado:false` — que também é informação.
- **Fase 5 — frontend religado (06/08).** Troquei `NEXT_PUBLIC_SUPABASE_URL` e
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` na Vercel (Production + Development) pela CLI e
  redeployei. O bundle em produção agora aponta para `jmtrkygcndaqnrgobnqo`;
  `imovelmap.com` saiu do HTTP 000 (era certificado SSL faltando) e responde 200.
  A `SUPABASE_SERVICE_ROLE_KEY` também foi trocada (o Jean passou a chave nova) e
  validada contra o PostgREST; a antiga devolve 401. Backup temporário (já apagado) ficava em
  `scratchpad/vlink/.backup-prod.env`.
  ⚠️ **As duas chaves secretas passaram por chat e devem ser rotacionadas.**

- **Fase 8 — funil de endereço (06/08).** EF `resolver-endereco` + RPCs
  `candidatos_endereco`, `filtrar_por_iptu`, `aplicar_endereco`, `cachear_predios`.
  Testado: anúncio **sem endereço**, só com coordenada ofuscada, resolveu para
  `Rua General João Telles 94 — Condomínio Tulipa` a 11,4 m, confiança 72, método `osm`.
  O passo 2 (IPTU) está escrito e devolve vazio até a Fase 7; liga sozinho depois.
- **Fase 11 — Rede Gaúcha coletando sozinha (06/08).** ⭐ **`redegauchadeimoveis.com.br`
  é o portal principal do Jean e NÃO bloqueia IP de datacenter** (HTTP 200 do servidor).
  Logo não precisa de extensão, navegador nem máquina ligada.
  · `sitemap-imoveis.xml` + `-2.xml` listam **19.942 imóveis** — catálogo inteiro, sem
    varrer busca.
  · O site é **Next.js App Router**: os dados vêm em chunks `self.__next_f.push([1,"…"])`
    (React Server Components), **não** em `__NEXT_DATA__` nem em tag `ld+json`. A EF
    `coletar-rgi` remonta esses chunks e lê o schema.org de dentro.
  · ⚠️ Dois detalhes que custaram tempo: o `@type` do imóvel é **array**
    (`["RealEstateListing","SingleFamilyResidence"]`), e o conserto de mojibake
    latin-1→utf8 é necessário em Python mas **estraga** em JS.
  · `pg_cron` `imovelmap-rgi` a cada 10 min, 60 por lote → catálogo completo em ~2,3 dias
    e recomeça (a 2ª volta é que detecta **queda de preço**). Cursor em
    `public.coleta_cursor`; chave de serviço no **Vault** (`service_role_key`).
  · Medido: 92% dos anúncios trazem **endereço de rua + CEP + coordenada** de graça.
- **Conta do Jean criada:** `mortaza@mtz.ag`, `super_admin`, ativa, e-mail confirmado.
  **Falta só definir a senha** (Dashboard → Authentication → Users → Reset password).
- **Conta de QA:** `qa-ingerir@imovelmap.com` (corretor comum), usada para testar a EF com
  JWT real. Script: `supabase/scripts/qa-token.sh`. **Apagar antes de abrir ao público.**

### ⚠️ Pendente

- **A senha do Jean ainda não está definida.** Dashboard → Authentication → Users →
  `mortaza@mtz.ag` → Reset password. Sem ela o login devolve "Invalid login credentials".
- O `schema.sql` original ficava fora do repo e se perdeu. O schema em `PROJETO.md` foi
  reconstruído lendo o código — agora vive em `supabase/migrations/`.

### 🔴 Bug no código do repo (não é config)

`lib/supabase/middleware.ts` redireciona **toda** rota sem sessão para `/login` —
inclusive `/` (o mapa público) e `/api/imoveis/publico`. Ou seja, **o mapa público
não é público**: visitante anônimo cai no login e o `MapaImoveis` nunca carrega.

A RLS já foi desenhada para isso funcionar (o `anon` tem `grant select` nas colunas
do card). Falta só o middleware deixar passar. Correção quando for mexer no repo:

```ts
const isPublica =
  url.pathname === "/" ||
  url.pathname.startsWith("/api/imoveis/publico") ||
  url.pathname.startsWith("/extensao");
if (!user && !isAuthRoute && !isPublica) { /* redirect */ }
```


### 🔒 Regras de segurança do banco (o repo é público — a anon key está à vista)
- **Toda tabela nova precisa de RLS + `grant` explícito.** O Supabase concede `ALL` a
  `anon`/`authenticated` por default privileges: sem revoke, a tabela nasce aberta.
- **Toda função nova precisa de `revoke execute from anon, authenticated`.** Isso já vale
  por default desde a `0009`, mas confira: foi exatamente assim que o `upsert_imovel`
  ficou chamável por visitante anônimo no primeiro teste.
- **O endereço é o produto.** `anon` tem `grant select` só nas colunas do card/mapa —
  `endereco`, `endereco_numero`, `complemento`, `cep`, `inscricao_imobiliaria`,
  `valor_venal` e `temperatura` ficam de fora. Ver `0006_rls.sql`.
- Rodar `get_advisors` depois de cada migration.

### ⚠️ Armadilhas que já custaram tempo
- **Nunca criar usuário por `insert into auth.users`.** As colunas de token
  (`confirmation_token`, `recovery_token`, `email_change*`, `phone_change*`,
  `reauthentication_token`) ficam `NULL`, e o GoTrue lê como string não-nulável:
  todo login do projeto passa a devolver **"Database error querying schema"**.
  Foi assim que a conta do Jean nasceu quebrada. Se precisar mesmo do insert,
  preencher todas com `''`. O certo é usar o endpoint de signup ou a Admin API.
- **Função chamada por EF tem que estar no schema `public`.** O PostgREST só expõe
  `public` e `graphql_public`. `cachear_predios` nasceu em `publico` e o `rpc()` dava
  404 — mas a EF não conferia `error`, então o cache ficava vazio *sem erro nenhum*.
  Sempre checar `{ data, error }` de `svc.rpc(...)`.
- **Espelho de Overpass sem cobertura devolve 200 com `elements: []`.**
  `overpass.osm.ch` só indexa a Suíça e "funcionou" para Porto Alegre com zero prédios —
  sucesso aparente, dado vazio. Espelho sem prédio nenhum agora conta como falha.
- **O `overpass-api.de` vive em 504.** O funil não deve depender de chamada ao vivo:
  o certo é semear `publico.osm_predios` por bairro e deixar o cache responder.
- **`vercel env add` com `printf` sem newline grava valor VAZIO.** Usar `--value`.
  As `NEXT_PUBLIC_*` entram no bundle em build: trocar a var exige **redeploy**.
- **Ao rotacionar a service_role key, atualize o Vault** — senão o cron da Rede Gaúcha
  para em silêncio: `select vault.update_secret((select id from vault.secrets where
  name='service_role_key'), '<nova>');`
- **Extrator com caminho fixo quebra em silêncio.** O da OLX procurava
  `props.pageProps.ads`; quando o portal mudou, caía no JSON-LD e trazia **1 imóvel**,
  parecendo pouca oferta. Hoje varre a árvore atrás de listas que *pareçam* anúncios.

### 🚫 Não faça
- **Não commite nem dê push sem o Jean pedir explicitamente** (regra do vault).
- Não exponha `service_role` / `sb_secret_` em nada versionado — **o repo é público**.

---

## Credenciais do Supabase novo

```
NEXT_PUBLIC_SUPABASE_URL=https://jmtrkygcndaqnrgobnqo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_nju5FZicYwkdvwy7vp-KXA_jjKyinLC
SUPABASE_SERVICE_ROLE_KEY=<pegar no dashboard — nunca commitar>
```

Dashboard: https://supabase.com/dashboard/project/jmtrkygcndaqnrgobnqo

**Ainda faltam na Vercel** — o deploy atual usa as vars antigas. Trocar e redeployar (Fase 5).

---

## Arquitetura em uma frase

Os portais bloqueiam IP de datacenter (403 medido em ZAP, VivaReal e OLX em 05/08), então
**a captura é feita por uma extensão Chrome no navegador do corretor** — IP residencial,
sessão real, sem anti-bot. O servidor só guarda, cruza e enriquece. Sem Apify, sem worker
de scraping, sem GitHub Actions.

O detalhe que faz funcionar: os portais são SPAs que chamam a própria API (`glue-api`) e
recebem JSON completo. A extensão intercepta essa resposta no MAIN world — o portal faz o
scraping pra gente.

---

## Onde o trabalho continua

Cronograma completo em `PROJETO.md` §7. Fases 2, 3 e 4 entregues. As próximas:

**Fase 5 — religar o frontend. 🔴 Bloqueada no Jean.** Precisa trocar as env vars na
Vercel (o build atual aponta para o Supabase deletado) e redeployar. Eu não tenho acesso
à Vercel. Valores em "Credenciais" acima; a `SUPABASE_SERVICE_ROLE_KEY` sai do dashboard.
Também depende de commitar `app/extensao/` no repo — e commit exige pedido explícito.

**Fase 6 — Extensão v0.2.** Descriptors de OLX e ImovelWeb + genérico por JSON-LD
(o net-hook já publica `__NEXT_DATA__` e `ld+json`, falta só o extrator), sidepanel e
modo varredura com checkpoint. Um portal novo = uma entrada em `core/descriptors.js`.

**Fase 7 — base pública local. ⚠️ Precisa de acesso direto ao Postgres.** A carga do
IPTU 2026 (CSV de 225 MB) não passa por `execute_sql` do MCP — precisa de `psql`/`\copy`
com a senha do banco, ou da Supabase CLI.

---

## Schema — o que o código já assume

Migrations em `supabase/migrations/`, aplicadas em ordem. O schema foi derivado lendo o
frontend, então estes pontos são contrato, não escolha de estilo:

| Decisão | Por quê |
|---|---|
| `imoveis.id` é uuid; o id do portal vira `external_id` | as FKs internas precisam de uuid; o upsert casa por `(source, external_id)` |
| A tabela da cota do dia chama **`distribuicoes`** | a RPC recebe `p_distribuicao_id`; `get_lease_atual` é só o nome da RPC |
| `upsert_imovel` nunca sobrescreve dado bom com `null` | a extensão manda payload parcial; update usa `coalesce(excluded, atual)` |
| Preço mudou → linha nova em `imovel_precos` | o "caiu 7,9% em 62 dias" do HUD sai daí, e é o insumo de `calcular_temperatura` |
| `unique (imovel_id, dia)` em `distribuicoes` | é o que garante a exclusividade do lead no dia |
| Alerta com campo `''` conta como "sem filtro" | o form do painel manda string vazia, não `null` |

**RPC a mais que o `PROJETO.md` não listava:** `marcar_trabalhado(p_distribuicao_id,
p_outcome, p_nota)` — `app/api/painel/marcar/route.ts` já a chamava. Existe.

---

## Páginas da extensão (prontas, falta commitar)

Criadas aqui em `app/extensao/`, espelhando a estrutura do repo. Para publicar:

1. Copiar `app/extensao/` para o clone do repo (o repo **não está clonado** nesta pasta).
2. Adicionar o link no header de `app/page.tsx`, dentro do `<nav>`:
   ```tsx
   <Link href="/extensao" style={navLink}>Extensão</Link>
   ```
3. Quando a extensão existir: colocar o zip em `public/extensao/imovelmap-radar-0.1.0.zip`
   e virar `DISPONIVEL = true` em `app/extensao/page.tsx`.
4. Definir `NEXT_PUBLIC_EXTENSAO_ID` na Vercel quando a extensão for publicada na Web Store.

**Como o login da extensão funciona:** `/extensao/conectar` pega a sessão Supabase já
existente do site e entrega para a extensão por dois caminhos — `chrome.runtime.sendMessage`
com o ID (extensão publicada, exige `externally_connectable` no manifest apontando para
`imovelmap.com`) e, como fallback para modo desenvolvedor, um `CustomEvent`
`imovelmap:conectar` na janela, que o content script escuta e responde com
`imovelmap:conectado`. Só o `refresh_token` deve ser guardado no `chrome.storage.local`.

---

## Convenções

- **Português** em UI, docs e commits. Commits sem acento: `tipo(escopo): resumo`.
- Estilo do app: **inline styles** em objetos `React.CSSProperties` no fim do arquivo
  (o projeto não usa Tailwind). Seguir o padrão de `app/page.tsx`.
- Supabase client: `lib/supabase/client.ts` (browser), `server.ts` (RSC), `middleware.ts`.
- Formato canônico do imóvel: `ImovelPayload` em `lib/scrapers/types.ts`.

---

## Pendências para o Jean decidir

- Chave Anthropic da .mtz para a EF `extrair-pagina` e o OCR de placa?
- Mapillary: criar conta grátis? (única chave externa do funil de endereço, e é opcional)
- Evolution API: instância do Mobiliza ou dedicada?
- **Repo é público** — migrar para privado antes de voltar a rodar?
- Extensão: repo próprio ou dentro do `imovelmap`? Web Store ou `.zip` direto?
