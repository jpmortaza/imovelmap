-- ImovelMap — Fase 2 · schema `publico` (PROJETO.md §4.1)
-- Base de dados abertos local: zero API, para sempre.
-- A carga dos CSVs e a Fase 7 — aqui so criamos a estrutura.
--
-- IPTU POA 2026 tem 32 colunas; mapeamos as que o funil usa e guardamos
-- o resto em `raw` para nao perder nada na carga.

create schema if not exists publico;

-- --------------------------------------------------------- cadastro do IPTU
-- ★ o passo genial do funil: area + pavimento + quarteirao elimina 95%
-- dos candidatos com um JOIN, sem imagem, sem IA, sem API.
-- Nao traz o nome do proprietario (removido por LGPD) — traz a
-- inscricao imobiliaria, que e a chave da matricula no cartorio.
create table publico.iptu_poa (
  id                    bigserial primary key,
  inscricao_imobiliaria text,
  setor                 text,
  quarteirao            text,
  lote                  text,
  unidade               text,
  logradouro            text,
  logradouro_norm       text,
  numero                text,
  complemento           text,
  cep                   text,
  bairro                text,
  pavimento             integer,
  area_construida       numeric(12, 2),
  area_terreno          numeric(12, 2),
  valor_venal           numeric(14, 2),
  uso                   text,
  tipo                  text,
  ano_construcao        integer,
  geom                  extensions.geography(Point, 4326),
  raw                   jsonb,
  carregado_em          timestamptz not null default now()
);

create index iptu_poa_inscricao_idx  on publico.iptu_poa (inscricao_imobiliaria);
create index iptu_poa_quarteirao_idx on publico.iptu_poa (setor, quarteirao);
-- o cruzamento do passo 2: quarteirao + area + pavimento
create index iptu_poa_filtro_idx     on publico.iptu_poa
  (setor, quarteirao, pavimento, area_construida);
create index iptu_poa_geom_idx       on publico.iptu_poa using gist (geom);
create index iptu_poa_logr_trgm_idx  on publico.iptu_poa
  using gin (logradouro_norm extensions.gin_trgm_ops);
create index iptu_poa_cep_idx        on publico.iptu_poa (cep);

-- --------------------------------------------------------- eixos de logradouro
-- geocodificacao local: endereco -> coordenada sem chamar ninguem
create table publico.logradouros_poa (
  id         bigserial primary key,
  codigo     text,
  nome       text,
  nome_norm  text,
  tipo       text,
  cep        text,
  bairro     text,
  geom       extensions.geometry(MultiLineString, 4326),
  raw        jsonb
);

create index logradouros_poa_geom_idx on publico.logradouros_poa using gist (geom);
create index logradouros_poa_trgm_idx on publico.logradouros_poa
  using gin (nome_norm extensions.gin_trgm_ops);

-- --------------------------------------------------------- alvaras
-- empresa no endereco -> socios (passo 3 do dossie de proprietario)
create table publico.alvaras_poa (
  id            bigserial primary key,
  cnpj          text,
  razao_social  text,
  nome_fantasia text,
  logradouro    text,
  logradouro_norm text,
  numero        text,
  complemento   text,
  bairro        text,
  atividade     text,
  situacao      text,
  raw           jsonb,
  carregado_em  timestamptz not null default now()
);

create index alvaras_poa_cnpj_idx on publico.alvaras_poa (cnpj);
create index alvaras_poa_logr_idx on publico.alvaras_poa
  using gin (logradouro_norm extensions.gin_trgm_ops);

-- --------------------------------------------------------- cache do Overpass
-- passo 1 do funil (cerco geografico). Cacheado: cada predio resolvido
-- vira referencia permanente e o proximo anuncio resolve sem API.
create table publico.osm_predios (
  osm_id          bigint primary key,
  osm_type        text not null default 'way',
  name            text,
  building        text,
  levels          integer,
  addr_street     text,
  addr_housenumber text,
  addr_postcode   text,
  geom            extensions.geometry(Geometry, 4326),
  centroide       extensions.geography(Point, 4326),
  tags            jsonb,
  atualizado_em   timestamptz not null default now()
);

create index osm_predios_geom_idx      on publico.osm_predios using gist (geom);
create index osm_predios_centroide_idx on publico.osm_predios using gist (centroide);
create index osm_predios_name_trgm_idx on publico.osm_predios
  using gin (name extensions.gin_trgm_ops);
