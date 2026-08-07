-- ImovelMap — Fase 2 · inteligencia (PROJETO.md §6)
-- imovel_precos · imovel_grupos · fachadas · agenciamentos · capturas

-- ------------------------------------------------------- historico de preco
-- alimentado pelo upsert_imovel a cada mudanca de preco.
-- "caiu 7,9% em 62 dias" sai daqui.
create table public.imovel_precos (
  id          bigserial primary key,
  imovel_id   uuid not null references public.imoveis(id) on delete cascade,
  price       numeric(14, 2),
  captured_at timestamptz not null default now()
);

create index imovel_precos_imovel_idx
  on public.imovel_precos (imovel_id, captured_at desc);

-- ------------------------------------------------------- dedup cross-portal
-- mesmo imovel anunciado em varios portais = sem exclusiva = lead quente.
-- grupo_id e o identificador do imovel do mundo real.
create table public.imovel_grupos (
  grupo_id   uuid not null default gen_random_uuid(),
  imovel_id  uuid not null references public.imoveis(id) on delete cascade,
  confianca  integer not null default 50 check (confianca between 0 and 100),
  metodo     text not null check (metodo in ('geo', 'phash', 'attrs', 'cadastro', 'manual')),
  created_at timestamptz not null default now(),

  primary key (grupo_id, imovel_id)
);

create index imovel_grupos_imovel_idx on public.imovel_grupos (imovel_id);

-- ------------------------------------------------------- fachadas
-- dHash calculado no browser (extensao) ou em Deno (EF).
-- embedding CLIP 512d vem do box Merebor — IA local, zero API.
create table public.fachadas (
  id                  uuid primary key default gen_random_uuid(),
  imovel_id           uuid references public.imoveis(id) on delete cascade,
  url                 text not null,
  phash               bigint,
  embedding           extensions.vector(512),
  endereco_confirmado text,
  inscricao_imobiliaria text,
  fonte               text check (fonte in ('anuncio', 'mapillary', 'corretor', 'osm')),
  created_at          timestamptz not null default now(),

  constraint fachadas_imovel_url_key unique (imovel_id, url)
);

create index fachadas_phash_idx on public.fachadas (phash)
  where phash is not null;
create index fachadas_embedding_idx on public.fachadas
  using hnsw (embedding extensions.vector_cosine_ops);

-- ------------------------------------------------------- pipeline (kanban)
create table public.agenciamentos (
  id          uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  imovel_id   uuid not null references public.imoveis(id) on delete cascade,
  etapa       text not null default 'prospeccao'
              check (etapa in ('prospeccao', 'contato', 'visita',
                               'proposta', 'contrato', 'perdido')),
  notas       text,
  valor_estimado numeric(14, 2),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint agenciamentos_corretor_imovel_key unique (corretor_id, imovel_id)
);

create index agenciamentos_corretor_idx
  on public.agenciamentos (corretor_id, etapa);

create trigger agenciamentos_set_updated_at
  before update on public.agenciamentos
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------- log de captura
-- quem capturou o que, de onde. auditoria + metrica do efeito de rede.
create table public.capturas (
  id           bigserial primary key,
  corretor_id  uuid references public.corretores(id) on delete set null,
  imovel_id    uuid references public.imoveis(id) on delete set null,
  origem       text not null default 'extensao'
               check (origem in ('extensao', 'cron', 'manual')),
  modo         text check (modo in ('passivo', 'ativo', 'varredura')),
  url          text,
  portal       text,
  capturado_em timestamptz not null default now()
);

create index capturas_corretor_idx on public.capturas (corretor_id, capturado_em desc);
create index capturas_portal_idx   on public.capturas (portal, capturado_em desc);
