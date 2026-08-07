# ImovelMap Radar — extensão Chrome (v0.3.0)

Captura imóveis dos portais **no navegador do corretor**, com IP residencial e
sessão real. O servidor só guarda, cruza e enriquece.

> Fases 4, 6 e 9 do `PROJETO.md`. Captura ZAP e VivaReal por interceptação de
> rede, OLX por `__NEXT_DATA__`, e qualquer imobiliária por JSON-LD.
> O HUD sobrepõe o dossiê na própria tela do anúncio.

---

## O HUD — a razão de instalar

Enquanto o corretor olha um anúncio, aparece por cima:

```
┌ ImovelMap ────────────────────────────┐
│ 🔥 TEMPERATURA 64        já mapeado   │
│ 📍 Rua Dona Laura, 320 · apto 703     │
│ 🏢 também em: olx · zapimoveis        │
│    3 preços diferentes → SEM EXCLUSIVA│
│ 📉 R$ 905k → 820k  (−9,4%)            │
│ 💰 valor venal IPTU: R$ 611k          │
│ 📜 2º Registro de Imóveis — Zona Leste│
│ [ dossiê ]  [ IPTU ]                  │
└───────────────────────────────────────┘
```

**O portal esconde o endereço; a extensão mostra.** E mostra a queda de preço
que aconteceu em *outro* portal — porque a temperatura é calculada sobre o
imóvel do mundo real, não sobre o anúncio.

O HUD só aparece em página de anúncio (a URL tem o id). Em busca, home ou
página institucional, não aparece. Clique no cabeçalho recolhe; no ✕ fecha
até a próxima página.

---

## Instalar em modo desenvolvedor

1. Chrome → `chrome://extensions` → ligue **Modo do desenvolvedor**.
2. **Carregar sem compactação** → selecione esta pasta (`extensao/`).
3. Clique no ícone da extensão → **Conectar ao ImovelMap**.
   Abre `imovelmap.com/extensao/conectar`; logue e a sessão passa sozinha.
4. Ainda no popup, ligue os portais que quer capturar. O Chrome vai pedir
   permissão para cada domínio — é o único momento em que a extensão ganha
   acesso a algum site.

Pronto. Navegue no ZAP normalmente: rolar uma página de busca já enfileira
os imóveis, e o contador do popup sobe.

---

## Como funciona

```
corretor rola a busca do ZAP
  │
  ├─ net-hook.js (MAIN world) intercepta o fetch que a PRÓPRIA página faz
  │  para a glue-api e lê um clone da resposta          ← 0 parsing de HTML
  │
  ├─ content.js repassa o corpo cru ao service worker   ← nada de CPU na aba
  │
  ├─ engine.js + descriptors.js → ImovelPayload[]
  │
  ├─ queue.js grava em IndexedDB                        ← offline-first
  │
  └─ api.js → EF `ingerir` (JWT do corretor) → upsert_imovel
```

**Por que interceptar em vez de raspar o HTML:** ZAP, VivaReal e ImovelWeb são
SPAs que pedem à própria API um JSON completo — com o endereço que a tela
esconde. Lendo essa resposta não há seletor de CSS para quebrar quando eles
mudarem o layout, e o dado vem mais rico do que qualquer scraper externo
conseguiria (que, aliás, hoje toma 403).

---

## Segurança e privacidade

- **Nenhum segredo na extensão.** Só a chave publicável (a mesma que o site
  expõe) e o JWT do próprio corretor. A `service_role` nunca sai do servidor —
  se saísse, estaria dentro de um `.zip` que qualquer usuário descompacta.
- **Só o `refresh_token` é guardado**, em `chrome.storage.local`. O access
  token vive em memória e é renovado sob demanda. Revogar acesso = encerrar
  a sessão no site.
- **Nada de `<all_urls>`.** O content script dos portais não está no manifest:
  é registrado dinamicamente e só depois do corretor autorizar aquele domínio
  no popup. Sem autorização, a extensão não vê nada.
- O hook **nunca altera** o que a página recebe (lê um clone) e todo o corpo
  está em `try/catch`: se algo aqui falhar, a navegação do corretor segue.

---

## ⚠️ Calibrar os descriptors na primeira rodada real

Os caminhos de campo da glue-api em `core/descriptors.js` foram escritos a
partir da estrutura conhecida do Grupo ZAP, mas **não puderam ser verificados
contra uma resposta real** — os portais devolvem 403 para IP de datacenter,
que é justamente o motivo desta extensão existir.

Cada campo é lido por uma lista de caminhos candidatos, então a chance de
funcionar de primeira é boa. Mas confirme assim:

1. No popup, clique em **Debug: off** para virar **on**.
2. Abra uma busca no ZAP e role uma vez.
3. `chrome://extensions` → *service worker* → Console:
   ```js
   chrome.storage.local.get(null, (o) =>
     console.log(Object.keys(o).filter((k) => k.startsWith("imovelmap.debug"))))
   ```
   ```js
   chrome.storage.local.get("imovelmap.debug.zapimoveis", (o) =>
     console.log(JSON.parse(o["imovelmap.debug.zapimoveis"].corpo)))
   ```
4. Compare o JSON real com os caminhos em `extrairGlueApi` e ajuste.
   `itensExtraidos: 0` com `motivo: "sem-itens-no-json"` significa que a
   lista está em outro caminho.

O engine sempre devolve um `motivo` quando não extrai nada — não existe
falha silenciosa.

---

## Estrutura

| Arquivo | Papel |
|---|---|
| `manifest.json` | MV3; host permissions opcionais por portal |
| `background.js` | roteador, fila, sync com backoff, badge |
| `core/net-hook.js` | MAIN world: intercepta `fetch`/`XHR` + `__NEXT_DATA__`/JSON-LD |
| `core/content.js` | ISOLATED: injeta o hook e repassa o corpo cru |
| `core/engine.js` | motor único; devolve `{portal, itens, motivo}` |
| `core/descriptors.js` | **um portal = uma entrada aqui**, não um scraper novo |
| `core/queue.js` | IndexedDB, dedup local, retry, poda |
| `core/auth.js` | sessão por handoff; só `refresh_token` persistido |
| `core/api.js` | cliente da EF `ingerir` |
| `core/conectar.js` | handshake com `imovelmap.com` |
| `core/hud.js` | overlay do dossiê sobre o anúncio (shadow DOM) |
| `ui/popup.*` | status, contadores, liga/desliga por portal, varredura |
| `ui/sidepanel.*` | lista do que foi capturado na sessão |

## Modo varredura

O botão *Varrer esta busca* **não dispara requisição nenhuma da extensão**.
Ele rola a página em passos de ~900 px com pausa aleatória de 1,4 a 3,2 s, e
deixa a própria SPA do portal pedir a próxima leva — que o net-hook colhe.
Para sozinho após 3 rolagens sem conteúdo novo, ou em 60 rolagens.

Sem tráfego sintético, não há assinatura de robô para o anti-bot detectar.

## Pendente

- `phash.js` — dHash das fotos no canvas (entra no funil de fachada, Fase 8)
- Botão "pedir matrícula" no HUD (depende da inscrição imobiliária, Fase 8)
- Valor venal no HUD (depende da carga do IPTU, Fase 7)
- Ícones (`icons/16-48-128.png`) — hoje a extensão sobe sem ícone próprio
