# ImovelMap — Projeto de Reconstrução

> **Objetivo:** reconstruir o ImovelMap sobre um Supabase novo, com a captura feita por **extensão Chrome** (sem Apify, sem worker de scraping), e transformar o produto no radar definitivo de agenciamento para corretores.
> Criado: 05/08/2026 · Supabase: `jmtrkygcndaqnrgobnqo` (sa-east-1, ACTIVE) · Vercel: `imovelmap` (superag.vercel.app / imovelmap.com)

---

## 1. Diagnóstico

| Item | Situação |
|---|---|
| Supabase antigo `wtpbewcneuxicnxyoppj` | **Deletado** (NXDOMAIN). Dados perdidos. |
| `schema.sql` | Ficava fora do repo — **perdido**. Reconstruído do código. |
| Frontend Next.js 14 | Intacto no GitHub e deployado na Vercel (READY, login quebrado). |
| Scrapers ZAP / VivaReal / ImovelWeb | ⚠️ **glue-api responde 403** hoje (testado 05/08). |
| Scraper OLX | ⚠️ **403 em tudo** (site, sitemap, API interna). Era por isso que usava Apify. |
| Scraper Rede Gaúcha | ✅ sitemap XML 200 — funciona com fetch puro. |

**Tabelas do código (8):** `imoveis`, `proprietarios`, `corretores`, `fontes`, `extracoes`, `favoritos`, `alertas`, `notificacoes`.
**RPCs do código (4):** `upsert_imovel(p jsonb)`, `distribuir_imoveis_do_dia`, `match_alertas_novos`, `get_lease_atual`.

**O problema:** os portais bloqueiam IP de datacenter. Servidor não passa — nem Edge Function, nem VPS, nem GitHub Actions.

**A solução:** **parar de raspar de fora.** A extensão roda no Chrome do corretor — IP residencial brasileiro, sessão real, navegador real, comportamento humano de verdade. Não existe anti-bot que detecte um corretor navegando no ZAP, porque ele *é* um corretor navegando no ZAP. O que era o maior obstáculo do projeto vira o maior ativo.

---

## 2. Arquitetura

```
┌── CHROME DO CORRETOR ────────────────────────────────────────────┐
│  Extensão "ImovelMap Radar" (MV3)                                │
│                                                                   │
│  corretor navega ZAP/VivaReal/OLX/qualquer imobiliária           │
│         │                                                         │
│         ├─ captura passiva: intercepta o JSON que o portal        │
│         │  já pede pra própria API (glue-api etc.) ─── 0 parsing  │
│         ├─ captura ativa: botão "salvar no ImovelMap"             │
│         ├─ HUD sobreposto: dedup, preço, endereço, valor venal    │
│         └─ pHash das fotos calculado no canvas (local)            │
│                          │                                        │
│                     fila IndexedDB (offline-first)                │
└──────────────────────────┼────────────────────────────────────────┘
                           │ JWT do corretor (sessão Supabase)
┌──────────────────────────▼─── SUPABASE (jmtrkygcndaqnrgobnqo) ────┐
│  EF ingerir  ──▶ valida, normaliza ──▶ RPC upsert_imovel           │
│  EF extrair-pagina ──▶ HTML+JSON-LD ──▶ LLM (sites desconhecidos)  │
│  EF resolver-endereco ──▶ Overpass + IPTU local + pHash            │
│  EF dedup · distribuir · notificar   ·   pg_cron para sitemaps     │
│                                                                    │
│  Postgres: imoveis · publico.iptu_poa · osm_predios · fachadas     │
└──────────────────────────┬─────────────────────────────────────────┘
                           │
           Vercel (Next.js) ┴ mapa público + painel + login
```

**O efeito de rede:** 10 corretores usando a extensão = 10 IPs residenciais alimentando a mesma base, de graça, enquanto trabalham. Cada um enxerga o que os outros já mapearam. **É um crawler distribuído que se paga em valor para quem opera.** O servidor só faz o que servidor faz bem: guardar, cruzar, enriquecer.

Restam no servidor apenas as fontes que não bloqueiam (Rede Gaúcha e sitemaps em geral), via `pg_cron` + EF `extrair-fonte`. Sem Apify, sem worker de browser, sem GitHub Actions.

---

## 3. A extensão — ImovelMap Radar

Reaproveita o padrão já provado do **mtzSpider 5.x**: *descriptor declarativo + engine unificado*. Um portal novo = um arquivo de descriptor, não um scraper novo.

```
imovelmap-radar/
├── manifest.json          MV3
├── background.js          service worker: roteador, fila, sync
├── offscreen.html/.js     mantém o SW vivo (padrão que já usamos)
├── core/
│   ├── auth.js            sessão Supabase (handoff do site)
│   ├── queue.js           IndexedDB, retry, backoff, dedup local
│   ├── engine.js          ⭐ roda qualquer descriptor
│   ├── descriptors.js     zap · vivareal · imovelweb · olx · redegaucha · genérico
│   ├── net-hook.js        injetado no MAIN world: intercepta fetch/XHR
│   ├── phash.js           dHash das fotos via canvas (sem baixar no servidor)
│   └── api.js             cliente da EF `ingerir`
└── ui/
    ├── popup            status, contadores, ligar/desligar por portal
    ├── sidepanel        lista do que foi capturado na sessão
    └── hud.js           overlay in-page (a feature matadora)
```

### 3.1 Login — sem reimplementar autenticação

O corretor clica em "Conectar" → abre `imovelmap.com/extensao/conectar` → **loga no site normalmente** (a mesma tela de sempre, Supabase Auth) → a página devolve a sessão para a extensão via `externally_connectable` + `chrome.runtime.sendMessage`.

A extensão guarda só o `refresh_token` em `chrome.storage.local` e renova o access token no service worker via `chrome.alarms`. Nenhuma senha passa pela extensão, nenhuma tela de login duplicada, e revogar acesso é encerrar a sessão no site.

### 3.2 Captura — três camadas

**1. Interceptação de rede — a boa.** ZAP, VivaReal e ImovelWeb são SPAs: o próprio site chama a `glue-api` e recebe **o JSON completo e estruturado** — exatamente o que o scraper antigo tentava buscar de fora e hoje toma 403. Um hook no `fetch`/`XHR` no MAIN world lê essa resposta de graça.
> O portal faz o trabalho de scraping pra gente. Zero parsing de HTML, zero quebra por mudança de layout, dado mais rico do que o scraper antigo pegava.

**2. DOM estruturado.** `JSON-LD` (`schema.org/RealEstateListing`, que quase todo portal embute), `__NEXT_DATA__`, microdata. Cobre a maioria dos sites de imobiliária pequena.

**3. Fallback LLM.** Site desconhecido → a extensão manda o HTML limpo para a EF `extrair-pagina` → LLM devolve `ImovelPayload`. **Funciona em qualquer imobiliária do Brasil, sem escrever um scraper.**

**Modo passivo:** o corretor rola uma página de busca do ZAP e 40 imóveis entram na base sem ele fazer nada.
**Modo ativo:** botão "salvar no ImovelMap" em qualquer página.
**Modo varredura:** ele manda percorrer uma busca inteira (com ritmo humano e limite por sessão) — o engine do mtzSpider já sabe fazer isso com checkpoint e retomada.

### 3.3 O HUD — inteligência onde o corretor já trabalha

Isso é o que faz o corretor instalar e nunca desinstalar. Enquanto ele olha um anúncio no ZAP, aparece sobreposto:

```
┌ ImovelMap ────────────────────────────┐
│ 🔥 TEMPERATURA 87        já mapeado   │
│ 📍 Rua Dona Laura, 320 · apto 703     │
│    (confiança 92% · IPTU + fachada)   │
│ 🏢 também em: VivaReal · OLX · Sub100 │
│    3 preços diferentes → SEM EXCLUSIVA│
│ 📉 R$ 890k → 820k  (-7,9% em 62 dias) │
│ 💰 valor venal IPTU: R$ 611k          │
│ 🕵️ Cond. Villa Bella · CNPJ 0X...     │
│    administradora: Predial XYZ        │
│ [ dossiê ]  [ pedir matrícula ]       │
└───────────────────────────────────────┘
```

O portal esconde o endereço; a extensão mostra. Nenhum concorrente entrega isso na tela do anúncio.

### 3.4 Notas técnicas

- **Fotos:** o dHash é calculado no próprio browser (canvas) e só o hash sobe — economiza banda e resolve fachada sem servidor baixar imagem.
- **Offline-first:** fila em IndexedDB, sync com backoff. Corretor sem internet não perde captura.
- **Rate limit próprio:** teto por sessão e ritmo humano, para não degradar a navegação dele nem chamar atenção.
- **Privacidade:** captura só nos domínios habilitados (`optional_host_permissions`, o corretor autoriza portal a portal), nunca `<all_urls>` por padrão. Nada de navegação pessoal.
- **Termos de uso:** capturar o que o corretor já vê no próprio navegador é muito mais defensável que raspar de servidor — mas os portais restringem redistribuição em massa. O mapa público deve expor dado agregado e sinal de oportunidade, não cópia de acervo. Vale uma revisão jurídica antes de abrir ao público.

---

## 4. Fachada → Endereço → Proprietário

O portal esconde o endereço, mas vaza **lat/lng aproximado + fotos + área + pavimento**. Isso basta — se você tiver o cadastro da cidade do lado. E tem.

### 4.1 Base local (zero API, para sempre)

| Fonte | O que tem | Custo |
|---|---|---|
| **IPTU Porto Alegre 2026** (CSV 225 MB) | **cadastro imobiliário completo**: setor/quarteirão/lote, logradouro, CEP, número, **unidade, pavimento**, área construída, **valor venal**, uso | grátis, sem chave |
| **Eixos de Logradouros POA** (shapefile) | geometria das ruas — geocodificação local | grátis |
| **Projetos de Edificação Aprovados** | inscrição, área, tipo, ano | grátis |
| **Cadastro de Alvarás** | empresas por logradouro + prédio | grátis |
| **OSM / Overpass** | polígono dos prédios, `name` (condomínio), `building:levels`, `addr:*` | grátis, sem chave |

> Verificado em 05/08: os quatro CSVs de POA baixam sem chave, Overpass responde normal, IPTU 2026 tem 32 colunas com `pavimento`, `num_endloc_unidade`, `mtr_area_construida_total`, `vlr_venal_imovel`.
> O IPTU **não traz o nome do proprietário** (removido por LGPD) — mas traz a **inscrição imobiliária**, que é a chave para pedir a matrícula no cartório, onde o nome está.

### 4.2 O funil

```
anúncio (lat/lng aprox. + fotos + área + pavimento)
 ├ 1. CERCO GEOGRÁFICO ── Overpass: prédios num raio de 150 m → ~40 candidatos   [0 API]
 ├ 2. FILTRO CADASTRAL ── IPTU local: quais têm unidade com aquela área,
 │    ★ o passo genial    naquele pavimento, naquele quarteirão → 1 a 3          [0 API]
 ├ 3. CONFIRMAÇÃO VISUAL ─ fachada vs. (a) prédios que o ImovelMap já resolveu,
 │                         (b) Mapillary → dHash + pgvector              [0-1 chave grátis]
 └ 4. OCR DA PLACA ─────── nome do condomínio → Overpass → endereço + CNPJ        [0 API]
     ▼
   ENDEREÇO + INSCRIÇÃO IMOBILIÁRIA + unidade provável
```

**O passo 2 é o diferencial.** Cruzar o anúncio com o cadastro de IPTU elimina 95% dos candidatos com um `JOIN` — sem imagem, sem IA, sem API. A imagem só desempata.

**Efeito de rede também aqui:** cada prédio resolvido vira referência permanente. O próximo anúncio daquele prédio resolve em milissegundos, sem chamar nada externo. Quanto mais roda, menos API usa.

**Visão local:** dHash roda no browser (extensão) e em Deno (EF). Para similaridade robusta a ângulo e luz, embeddings CLIP num **box Merebor** — IA local, zero API, alinhado com o produto de soberania de dados da .mtz. `pgvector` guarda os vetores.

### 4.3 Proprietário — do grátis ao definitivo

| # | Caminho | Fonte | Custo |
|---|---|---|---|
| 1 | Anúncio de pessoa física (FSBO) | o próprio anúncio | 0 |
| 2 | **CNPJ do condomínio** → administradora e síndico | **BrasilAPI** `/cnpj/v1/{cnpj}` (grátis, sem chave — substitui o ReceitaWS de 3 req/min do código antigo) | 0 |
| 3 | Empresa no endereço (comercial) → sócios | Alvarás POA local + BrasilAPI | 0 |
| 4 | **Inscrição imobiliária** → matrícula no Registro de Imóveis (o código já mapeia os 6 cartórios de POA por bairro) | ONR / cartório | ~R$ 50-100, **só quando o lead vale** |
| 5 | Valor venal vs. preço pedido | IPTU local | 0 |

Passos 1–3 e 5 rodam automáticos em todo imóvel, custo zero. O passo 4 — o único que dá nome e CPF com certeza — é **um botão que o corretor aperta** quando o lead esquenta. Custo por oportunidade real, não por linha de banco.

**LGPD:** tudo é registro público ou dado do próprio anúncio, sob legítimo interesse para prospecção — a atividade-fim do corretor. Manter log de quem consultou o quê (`proprietarios` já é isolada por corretor via RLS) e não expor dado pessoal no mapa público.

---

## 5. Features de agenciamento

1. **🔥 Radar cross-portal** — muitos portais = sem exclusividade = lead quente
2. **📉 Histórico de preço + dias no mercado** — queda + tempo parado = hora de abordar
3. **🏠 Endereço revelado** — o funil da seção 4
4. **🕵️ Dossiê do proprietário** — condomínio/CNPJ/sócios/síndico + botão de matrícula
5. **💰 Valor venal vs. preço pedido** — cruzamento que ninguém mais tem
6. **📍 Qualquer site** — extensão + `extrair-pagina` cobrem o Brasil inteiro
7. **📲 Alerta WhatsApp** via Evolution API (infra do Mobiliza)
8. **📋 Pipeline de agenciamento** — kanban até o contrato

---

## 6. Schema

✅ **Aplicado em 05/08.** Migrations versionadas em `supabase/migrations/` (0001–0010).

```
-- núcleo (reconstruído do código)                                          ✅
corretores · fontes · extracoes · imoveis · proprietarios
favoritos · alertas · notificacoes · distribuicoes

-- inteligência                                                             ✅
imovel_precos   (imovel_id, price, captured_at)
imovel_grupos   (grupo_id, imovel_id, confianca, metodo geo|phash|attrs|cadastro)
fachadas        (imovel_id, url, phash, embedding vector(512), endereco_confirmado)
agenciamentos   (corretor_id, imovel_id, etapa, notas)
capturas        (corretor_id, origem extensao|cron, url, portal, capturado_em)

-- base pública local (schema `publico`) — estrutura criada, carga é a Fase 7
publico.iptu_poa · publico.logradouros_poa · publico.alvaras_poa · publico.osm_predios

-- RPCs                                                                     ✅
upsert_imovel · distribuir_imoveis_do_dia · get_lease_atual · match_alertas_novos
marcar_trabalhado · calcular_temperatura
-- ainda por fazer: resolver_endereco (Fase 8) · agrupar_duplicatas (Fase 10)
```

Extensões Postgres: `postgis`, `pgvector`, `pg_cron`, `pg_net`, `pg_trgm`. ✅

**Ajustes que a leitura do código impôs:**
- `leases` virou **`distribuicoes`** — a RPC que o painel chama recebe `p_distribuicao_id`.
- Apareceu uma 5ª RPC que o `PROJETO.md` não listava: **`marcar_trabalhado`**, já chamada
  por `app/api/painel/marcar/route.ts`.
- `imoveis.id` é uuid e o id do portal virou `external_id`; o upsert casa por
  `(source, external_id)`.

**Segurança (o repo é público):** `anon` só enxerga as colunas do card/mapa — endereço,
número, CEP, inscrição imobiliária, valor venal e temperatura ficam fora do `grant`.
Nenhuma RPC é executável por `anon`.

---

## 7. Cronograma

| # | Fase | Entregas | Status |
|---|---|---|---|
| **1** | **Criar projeto novo `imovelmap` na org `mtz`** | `jmtrkygcndaqnrgobnqo`, sa-east-1, $10/mês | ✅ **feito 05/08** |
| **2** | **Schema + RLS + RPCs** | 14 tabelas `public` + 4 `publico`, RLS em todas, 6 RPCs, 5 extensões — migrations em `supabase/migrations/` | ✅ **feito 05/08** |
| **3** | **EF `ingerir`** | EF no ar (`verify_jwt`), RPC `ingerir_lote` (1 round-trip por lote), log em `capturas` + `extracoes` | ✅ **feito 05/08** |
| **4** | **Extensão v0.1 — MVP** | MV3, handoff de sessão, net-hook, engine + descriptors ZAP/VivaReal, fila IndexedDB, popup — em `extensao/` | ✅ **feito 05/08** |
| **5** | **Religar o frontend** | env vars públicas trocadas + redeploy; build aponta pro Supabase novo, login e /admin de pé · falta a `SERVICE_ROLE_KEY` | 🟡 **quase — 06/08** |
| **6** | **Extensão v0.2** | OLX (`__NEXT_DATA__`), ImovelWeb, genérico JSON-LD por site autorizado, sidepanel, modo varredura sem tráfego sintético | ✅ **feito 06/08** |
| 7 | Base pública local | ✅ cache Overpass funcionando · falta a carga do IPTU/logradouros/alvarás (precisa de `psql`) | 🟡 **parcial 06/08** |
| **8** | **EF `resolver-endereco`** | cerco Overpass ✅ + filtro IPTU escrito (inerte até a Fase 7) · falta o dHash | 🟡 **parcial 06/08** |
| **9** | **HUD na extensão** | overlay em shadow DOM com temperatura, cross-portal, queda de preço, endereço e cartório — consome a EF `dossie` | ✅ **feito 06/08** |
| 10 | Dossiê + dedup | ✅ `agrupar_duplicatas`, temperatura por grupo, EF `dossie` com BrasilAPI e cartório · falta o botão de matrícula na UI | 🟡 **parcial 06/08** |
| **11** | **Rede Gaúcha por cron** | ✅ EF `coletar-rgi` + `pg_cron` a cada 10 min sobre os 19.942 do sitemap, sem navegador · falta o fallback LLM (chave Anthropic) | 🟡 **parcial 06/08** |
| 12 | Distribuição e pipeline | ✅ `pg_cron` diário + agrupamento a cada 2 h · falta alerta WhatsApp e kanban | 🟡 **parcial 06/08** |

Ao fim da **Fase 5** o produto volta a viver e já está capturando. A **Fase 9** é a que vende.

### Decisões pendentes
- **Chave Anthropic** da .mtz para o `extrair-pagina` e o OCR de placa?
- **Mapillary**: crio conta grátis? (única chave externa do funil, e opcional)
- **Evolution API**: instância do Mobiliza ou dedicada?
- Repo `jpmortaza/imovelmap` é **público** — migrar pra privado? (a extensão vai junto ou em repo próprio?)
- Extensão na **Chrome Web Store** ou distribuída como `.crx`/modo desenvolvedor para os corretores clientes?

---

## 8. Referências
- Repo: https://github.com/jpmortaza/imovelmap · Vercel: https://vercel.com/jean-mortazas-projects/imovelmap
- Supabase: https://supabase.com/dashboard/project/jmtrkygcndaqnrgobnqo
- Padrão de extensão a reaproveitar: `dev/chrome/mtzSpider` (engine + descriptors) e `dev/chrome/mtzSec` (MV3, offscreen, sidepanel)
- Dados abertos POA: https://dadosabertos.poa.br · Overpass: https://overpass-api.de · BrasilAPI: https://brasilapi.com.br
- PixelRAG (inspiração do passo visual): https://github.com/StarTrail-org/PixelRAG
