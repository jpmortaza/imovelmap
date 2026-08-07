# ImovelMap — contexto para o agente

> Leia `PROJETO.md` antes de qualquer coisa. Este arquivo é o estado operacional.
> Última atualização: 07/08/2026

---

## O que é

Plataforma de agenciamento de imóveis: mapa público + painel do corretor. O corretor
recebe uma cota diária de imóveis, descobre o endereço que o portal esconde, identifica
o proprietário e oferece agenciamento.

**Site:** imovelmap.com · superag.vercel.app
**Repo:** https://github.com/jpmortaza/imovelmap (Next.js 14 App Router, **público**)
**Vercel:** projeto `imovelmap`, team `team_HvRUGIod9WDS70QCgJYSjXCF`

---

## Estado atual (07/08/2026)

### ⭐ O achado que reorganiza o produto (07/08)

**Porto Alegre publica a matrícula do registro de imóveis, de graça.**

O dataset `itbi` em `dadosabertos.poa.br` traz 354.728 transações de 2020 a
2026 e, em **99,97%** delas, `n_matricula_reg_imoveis` + `n_zona_reg_imoveis` —
o número da matrícula e em qual dos seis cartórios ela está. Junto vêm número
da porta, **número da unidade**, área privativa, CEP (100%), valor e data da
última venda e ano de construção.

Isso muda o funil inteiro. Antes: descobrir endereço → pagar busca às cegas no
cartório → torcer. Agora: `matrícula 91792, 1ª Zona` → certidão de inteiro teor
→ **nome e CPF do proprietário**. Sem busca paga.

Estado: **4.074 matrículas cravadas** e **13.676 prédios** com matrículas
candidatas. Roda sozinho no `pg_cron` (`imovelmap-itbi`, de 15 em 15 min).

Duas coisas que valem mais que o número:

1. **Área privativa, não construída total.** O anúncio publica privativa; o
   IPTU só dá a construída total, que inclui parede e área comum e nunca bate.
   Era isso que fazia o casamento por IPTU render tão pouco.

2. **Número deduzido ≠ número publicado, e isso foi medido.** Teste cego:
   escondi o número que a Auxiliadora e a Guarida publicam, deixei a inferência
   escolher, comparei com a verdade em 544 endereços.

   | evidência | acerto |
   |---|---|
   | rua + área (sem CEP) | 56,4% |
   | rua + CEP + área | **78,9%** |

   Mexer na tolerância de área não muda (78,6 / 82,8 / 79,1% para 1/2/3%): o
   erro é **estrutural**. Quando o prédio certo não transacionou desde 2020, o
   "único candidato" daquele CEP vira o vizinho, e ele casa. ~80% é o teto.
   Por isso existe a coluna `numero_inferido`, a confiança cai para 78, a UI
   avisa em amarelo, a matrícula diz que herda a dúvida — e inferir sem CEP
   (56%) deixou de ser feito.

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

### Base de dados de referência (07/08) — tudo público, tudo de graça

| Tabela | Linhas | De onde | Serve para |
|---|---|---|---|
| `publico.itbi` | 354.728 | CKAN de POA, 7 recursos (2020-2026) | **matrícula + cartório**, nº da porta, unidade, última venda |
| `publico.osm_enderecos` | 128.360 | extrato Geofabrik `sul-latest.osm.pbf` | candidatos de nº de porta no RS |
| `publico.condominios` | 10.245 | sitemap de condomínios do Lopes | nome do prédio (6.858 anúncios nomeados), chave de CNPJ |

Nenhuma delas precisou de `psql` nem de download de CSV gigante — era isso que
travava a Fase 7. O CKAN de POA tem **datastore ativo**: dá para consultar por
SQL via API e paginar. A carga inteira do ITBI leva ~6 min.

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
- **O `overpass-api.de` vive em 504.** E consultar cidade inteira derruba qualquer
  espelho. Não insista: **use o extrato da Geofabrik** (`sul-latest.osm.pbf`, 421 MB,
  publicado justamente para uso em massa) com `pyosmium`. A alternativa que tentei —
  grade de 216 quadros — levava ~6 h e castigava um espelho público. O extrato inteiro
  levou segundos para baixar e ~2 min para extrair 129.670 endereços do RS.
  Espelho que funciona hoje, se precisar de consulta pontual: `overpass.private.coffee`.
- **No Brasil o OSM mapeia COMÉRCIO, não prédio residencial.** "O ponto de endereço
  mais próximo na mesma rua" devolve a padaria da esquina. Gravei 76 números de
  vizinho com confiança 85 — `Av. João Pessoa 1027 · complemento "Padaria João
  Pessoa"` — antes de olhar o resultado. Desfeito. Dos 129.670 pontos, só 75.213 têm
  tag `building`. Hoje o OSM só dá **candidatos**; quem decide é o ITBI.
- **`similarity(a,b) >= 0.6` não usa o índice GIN; o operador `%` usa.** Com 354 mil
  linhas isso é a diferença entre `statement timeout` e 8 s por lote de 250.
  O `%` lê `pg_trgm.similarity_threshold` — `set_config(..., true)` dentro da função.
- **O papel da API roda com `safeupdate`:** `delete` sem `where` é recusado. Em temp
  table use `truncate`. Funciona pelo SQL editor e falha pelo PostgREST — some no teste.
- **`service_role` tem `statement_timeout` de 8 s por padrão**, curto demais para lote.
  `alter role service_role set statement_timeout = '180s'`.
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

Já trocadas na Vercel e em produção desde 06/08.
⚠️ **As duas chaves secretas passaram por chat e devem ser rotacionadas.**

---

## Arquitetura em uma frase

**Duas arquiteturas, e a segunda acabou sendo a principal.**

*Coleta do servidor, sem navegador:* Rede Gaúcha, Guarida e Lopes **não** bloqueiam IP
de datacenter e publicam sitemap com o catálogo inteiro. Rodam no `pg_cron`, sozinhos,
sem máquina ligada. É de onde vem a maior parte da base hoje.

*Coleta pela extensão:* os portais grandes bloqueiam (403 medido em ZAP, VivaReal e OLX em 05/08),
então para eles a captura é feita por uma **extensão Chrome no navegador do corretor** —
IP residencial, sessão real, sem anti-bot. Sem Apify, sem worker de scraping.

O servidor guarda, cruza e **enriquece com dado público**: é o enriquecimento, não a
coleta, que produz o que o portal esconde — endereço, matrícula, dono.

O detalhe que faz funcionar: os portais são SPAs que chamam a própria API (`glue-api`) e
recebem JSON completo. A extensão intercepta essa resposta no MAIN world — o portal faz o
scraping pra gente.

---

## Onde o trabalho continua

Fases 2, 3, 4, 5, 6, 9, 10, 11 e 12 entregues. **A Fase 7 saiu do papel por um caminho
diferente do planejado** — ver abaixo.

**Fase 7 — base pública local. ✅ Destravada, sem `psql`.** O plano previa baixar o CSV
de 225 MB do IPTU e carregar por `\copy`, o que exigia a senha do banco e travou a fase
por semanas. Não precisava: `dadosabertos.poa.br` roda **CKAN com datastore ativo** —
consulta por SQL via API, paginada, de graça. Foi assim que entraram IPTU, ITBI e
alvarás. **Regra geral: antes de baixar arquivo grande, teste `datastore_search_sql`.**

**O que sobrou de POA e ainda não usamos:**
- `cadastro-de-alvaras` (186.779) — tem logradouro + prédio + atividade + flag MEI, mas
  **não tem nome nem CNPJ**. Pista fraca de "tem gente com negócio nesse endereço".
- `projetos-de-edificacao-aprovados` (19.538) — sem endereço; o campo `numero` parece
  ser setor/quarteirão/lote. Só serve se alguém achar a chave.
- `iptu-beneficios-fiscais`, `itbi-imunidades` — não sondados.

**Próximos passos, em ordem de valor:**

1. **CNPJ do condomínio → síndico.** Já temos 10.245 nomes de condomínio com endereço.
   Falta uma busca CNPJ *por nome/endereço* que seja gratuita e legal — a BrasilAPI só
   faz CNPJ→dados, não o inverso. O caminho oficial é o dump de Estabelecimentos da
   Receita (bulk, alguns GB); a URL mudou para um portal SERPRO+ e não foi localizada
   em 07/08. **Vale a pena: empresa registrada em endereço residencial quase sempre é
   o morador.**
2. **Mais fontes do RS.** Sondados e viáveis, ainda não coletados:
   `lopes.com.br` (~4.500 imóveis no RS, robots libera) e `hoffmannimoveis.com.br`
   (502, mesmo formato RSC da Rede Gaúcha).
   **Descartados por `robots.txt` (`Disallow: /`):** chavesnamao, casaimoveis,
   imobiliariatempo, cristofoli. Não se coleta de quem pediu que não coletassem.
3. **Temperatura com comparáveis do ITBI.** Temos o preço real de venda de 354 mil
   transações. Anúncio muito acima do que o prédio vendeu não sai — e dono de imóvel
   encalhado é o melhor alvo de agenciamento que existe. Hoje `calcular_temperatura`
   não olha isso.
4. **Agrupamento entre portais.** ⏸️ Parado numa decisão do Jean: o limiar. Medido —
   150 m gera ~14.000 pares, 60 m + mesmos dormitórios ~6.600, 25 m ~4.200.
   Recomendo 60 m. Gravar 14 mil grupos errados envenena justamente o sinal
   "N preços diferentes → SEM EXCLUSIVA" que o mapa existe para mostrar.

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
