-- ImovelMap — Fase 2 · nucleo
-- 9 tabelas exigidas pelo codigo do app (reconstruidas lendo o frontend):
-- corretores · fontes · extracoes · imoveis · distribuicoes
-- favoritos · alertas · notificacoes · proprietarios

-- ---------------------------------------------------------------- utilitario
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- corretores
-- espelha auth.users; id = auth.uid()
create table public.corretores (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  nome        text,
  telefone    text,
  creci       text,
  role        text not null default 'corretor'
              check (role in ('corretor', 'admin', 'super_admin')),
  ativo       boolean not null default true,
  cota_diaria integer not null default 10 check (cota_diaria >= 0),
  cidade      text,
  estado      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index corretores_ativo_idx on public.corretores (ativo) where ativo;

create trigger corretores_set_updated_at
  before update on public.corretores
  for each row execute function public.set_updated_at();

-- todo usuario que se cadastra vira corretor (inativo ate liberacao? nao:
-- ativo por padrao, o admin desliga se precisar)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.corretores (id, email, nome)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nome',
             new.raw_user_meta_data ->> 'full_name',
             split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- fontes
create table public.fontes (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  nome               text not null,
  tipo               text not null default 'extensao'
                     check (tipo in ('extensao', 'apify', 'custom_http',
                                     'scrapfly', 'rss', 'sitemap', 'other')),
  url_base           text,
  cidade             text,
  estado             text,
  ativo              boolean not null default true,
  cron               text,
  config             jsonb not null default '{}'::jsonb,
  ultima_execucao_em timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index fontes_ativo_idx on public.fontes (ativo) where ativo;

create trigger fontes_set_updated_at
  before update on public.fontes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- extracoes
create table public.extracoes (
  id                uuid primary key default gen_random_uuid(),
  fonte_id          uuid references public.fontes(id) on delete set null,
  corretor_id       uuid references public.corretores(id) on delete set null,
  origem            text not null default 'manual'
                    check (origem in ('manual', 'cron', 'extensao')),
  status            text not null default 'queued'
                    check (status in ('queued', 'running', 'ok',
                                      'error', 'cancelled')),
  triggered_at      timestamptz not null default now(),
  started_at        timestamptz,
  finished_at       timestamptz,
  duracao_ms        integer,
  total_encontrados integer not null default 0,
  total_novos       integer not null default 0,
  total_atualizados integer not null default 0,
  total_erros       integer not null default 0,
  erro_msg          text,
  meta              jsonb not null default '{}'::jsonb
);

create index extracoes_triggered_idx on public.extracoes (triggered_at desc);
create index extracoes_fonte_idx     on public.extracoes (fonte_id);

-- ---------------------------------------------------------------- imoveis
-- formato canonico: ImovelPayload (lib/scrapers/types.ts), em snake_case.
-- id do portal vira external_id; a PK e uuid para as FKs internas.
create table public.imoveis (
  id                     uuid primary key default gen_random_uuid(),
  source                 text not null,
  external_id            text not null,
  source_url             text not null,
  fonte_id               uuid references public.fontes(id) on delete set null,

  title                  text,
  transaction_type       text check (transaction_type in ('sale', 'rent')),
  property_type          text,
  property_sub_type      text,

  price                  numeric(14, 2),
  price_formatted        text,
  condominium_fee        numeric(14, 2),
  iptu                   numeric(14, 2),
  price_per_sqm          numeric(14, 2),

  area                   numeric(10, 2),
  bedrooms               integer,
  bathrooms              integer,
  parking_spaces         integer,

  -- endereco: nunca exposto ao publico anonimo (ver grants em 0006)
  endereco               text,
  endereco_numero        text,
  complemento            text,
  cep                    text,
  neighborhood           text,
  city                   text,
  state                  text,
  latitude               double precision,
  longitude              double precision,
  geom extensions.geography(Point, 4326)
    generated always as (
      case
        when latitude is not null and longitude is not null
        then extensions.st_setsrid(
               extensions.st_makepoint(longitude, latitude), 4326
             )::extensions.geography
      end
    ) stored,

  -- resultado do funil da Fase 8
  inscricao_imobiliaria  text,
  endereco_confianca     integer check (endereco_confianca between 0 and 100),
  endereco_metodo        text,
  valor_venal            numeric(14, 2),

  images                 text[] not null default '{}',
  image_count            integer not null default 0,

  temperatura            integer not null default 0
                         check (temperatura between 0 and 100),
  is_active              boolean not null default true,
  published_at           timestamptz,
  scraped_at             timestamptz,
  first_seen_at          timestamptz not null default now(),
  last_seen_at           timestamptz not null default now(),
  raw                    jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint imoveis_source_external_key unique (source, external_id)
);

create index imoveis_ativos_idx       on public.imoveis (first_seen_at desc)
  where is_active;
create index imoveis_geom_idx         on public.imoveis using gist (geom);
create index imoveis_city_idx         on public.imoveis (city);
create index imoveis_neighborhood_idx on public.imoveis (neighborhood);
create index imoveis_price_idx        on public.imoveis (price);
create index imoveis_transaction_idx  on public.imoveis (transaction_type);
create index imoveis_title_trgm_idx   on public.imoveis
  using gin (title extensions.gin_trgm_ops);
create index imoveis_inscricao_idx    on public.imoveis (inscricao_imobiliaria)
  where inscricao_imobiliaria is not null;

create trigger imoveis_set_updated_at
  before update on public.imoveis
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- distribuicoes
-- a "cota diaria": cada imovel fica reservado para um corretor no dia.
-- get_lease_atual / marcar_trabalhado / distribuir_imoveis_do_dia operam aqui.
create table public.distribuicoes (
  id            uuid primary key default gen_random_uuid(),
  corretor_id   uuid not null references public.corretores(id) on delete cascade,
  imovel_id     uuid not null references public.imoveis(id) on delete cascade,
  dia           date not null default current_date,
  status        text not null default 'pendente'
                check (status in ('pendente', 'trabalhado', 'expirado')),
  outcome       text check (outcome in ('contatou_proprietario', 'agendou_visita',
                                        'sem_resposta', 'descartado')),
  nota          text,
  trabalhado_em timestamptz,
  created_at    timestamptz not null default now(),

  -- exclusividade: um imovel por corretor por dia
  constraint distribuicoes_imovel_dia_key unique (imovel_id, dia)
);

create index distribuicoes_corretor_dia_idx
  on public.distribuicoes (corretor_id, dia desc);
create index distribuicoes_imovel_idx on public.distribuicoes (imovel_id);

-- ---------------------------------------------------------------- favoritos
create table public.favoritos (
  id          uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  imovel_id   uuid not null references public.imoveis(id) on delete cascade,
  nota        text,
  created_at  timestamptz not null default now(),

  constraint favoritos_corretor_imovel_key unique (corretor_id, imovel_id)
);

create index favoritos_corretor_idx
  on public.favoritos (corretor_id, created_at desc);

-- ---------------------------------------------------------------- alertas
create table public.alertas (
  id               uuid primary key default gen_random_uuid(),
  corretor_id      uuid not null references public.corretores(id) on delete cascade,
  nome             text not null,
  city             text,
  neighborhood     text,
  transaction_type text,
  property_type    text,
  price_min        numeric(14, 2),
  price_max        numeric(14, 2),
  area_min         numeric(10, 2),
  area_max         numeric(10, 2),
  bedrooms_min     integer,
  bathrooms_min    integer,
  parking_min      integer,
  notificar_email  boolean not null default true,
  notificar_whats  boolean not null default false,
  ativo            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index alertas_corretor_idx on public.alertas (corretor_id, created_at desc);
create index alertas_ativos_idx   on public.alertas (ativo) where ativo;

create trigger alertas_set_updated_at
  before update on public.alertas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- notificacoes
create table public.notificacoes (
  id          uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  imovel_id   uuid references public.imoveis(id) on delete cascade,
  alerta_id   uuid references public.alertas(id) on delete cascade,
  tipo        text not null default 'alerta'
              check (tipo in ('alerta', 'preco', 'distribuicao', 'sistema')),
  titulo      text,
  mensagem    text,
  visualizada boolean not null default false,
  enviada_em  timestamptz,
  created_at  timestamptz not null default now(),

  constraint notificacoes_alerta_imovel_key unique (alerta_id, imovel_id)
);

create index notificacoes_corretor_idx
  on public.notificacoes (corretor_id, created_at desc);
create index notificacoes_nao_lidas_idx
  on public.notificacoes (corretor_id) where not visualizada;

-- ---------------------------------------------------------------- proprietarios
-- dado pessoal: isolado por corretor via RLS (LGPD, PROJETO.md §4.3)
create table public.proprietarios (
  id          uuid primary key default gen_random_uuid(),
  imovel_id   uuid not null references public.imoveis(id) on delete cascade,
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  nome        text,
  telefone    text,
  email       text,
  cpf_cnpj    text,
  origem      text,
  status      text not null default 'identificado',
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint proprietarios_imovel_corretor_key unique (imovel_id, corretor_id)
);

create index proprietarios_corretor_idx on public.proprietarios (corretor_id);

create trigger proprietarios_set_updated_at
  before update on public.proprietarios
  for each row execute function public.set_updated_at();
