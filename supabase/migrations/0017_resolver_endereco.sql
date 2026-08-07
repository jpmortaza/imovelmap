-- ImovelMap — Fase 8 · funil de endereço (passos 1 e 2)
--
-- O anúncio esconde o endereço mas vaza lat/lng aproximado, área e pavimento.
-- Isso basta se você tiver o cadastro da cidade do lado (PROJETO.md §4).
--
--   1. CERCO GEOGRÁFICO  prédios num raio de 150 m           ~40 candidatos
--   2. FILTRO CADASTRAL  IPTU: quem tem unidade com aquela
--      ★ o passo genial   área, naquele pavimento             1 a 3
--
-- O passo 1 já roda: o cache `publico.osm_predios` é alimentado pela EF
-- `resolver-endereco`, que chama o Overpass sob demanda. O passo 2 fica
-- inerte até a carga do IPTU (Fase 7) e liga sozinho quando ela chegar.
--
-- ★ Efeito de rede: cada prédio consultado fica no cache para sempre. O
--   próximo anúncio daquele quarteirão resolve sem chamar nada externo.

-- ------------------------------------------------- cache do Overpass
create or replace function publico.cachear_predios(p_predios jsonb)
returns integer
language plpgsql
security definer
set search_path = publico, public, pg_temp
as $$
declare
  v_n integer := 0;
begin
  if jsonb_typeof(p_predios) <> 'array' then
    return 0;
  end if;

  insert into publico.osm_predios (
    osm_id, osm_type, name, building, levels,
    addr_street, addr_housenumber, addr_postcode, centroide, tags, atualizado_em
  )
  select
    (e ->> 'id')::bigint,
    coalesce(e ->> 'type', 'way'),
    e #>> '{tags,name}',
    e #>> '{tags,building}',
    public.j_int(e #>> '{tags,building:levels}'),
    e #>> '{tags,addr:street}',
    e #>> '{tags,addr:housenumber}',
    e #>> '{tags,addr:postcode}',
    case
      when (e #>> '{center,lat}') is not null then
        extensions.st_setsrid(
          extensions.st_makepoint(
            (e #>> '{center,lon}')::double precision,
            (e #>> '{center,lat}')::double precision
          ), 4326)::extensions.geography
    end,
    e -> 'tags',
    now()
  from jsonb_array_elements(p_predios) e
  where (e ->> 'id') is not null
    and (e #>> '{center,lat}') is not null
  on conflict (osm_id) do update set
    name             = coalesce(excluded.name,             osm_predios.name),
    building         = coalesce(excluded.building,         osm_predios.building),
    levels           = coalesce(excluded.levels,           osm_predios.levels),
    addr_street      = coalesce(excluded.addr_street,      osm_predios.addr_street),
    addr_housenumber = coalesce(excluded.addr_housenumber, osm_predios.addr_housenumber),
    addr_postcode    = coalesce(excluded.addr_postcode,    osm_predios.addr_postcode),
    centroide        = coalesce(excluded.centroide,        osm_predios.centroide),
    tags             = coalesce(excluded.tags,             osm_predios.tags),
    atualizado_em    = now();

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------- passo 1: cerco geográfico
-- Devolve os prédios do raio, já pontuados. Prédio com endereço completo
-- no OSM vale muito mais que prédio anônimo — é ele que fecha o funil hoje,
-- enquanto o IPTU não está carregado.
create or replace function public.candidatos_endereco(
  p_imovel_id uuid,
  p_raio      integer default 150
)
returns table (
  osm_id           bigint,
  nome             text,
  addr_street      text,
  addr_housenumber text,
  addr_postcode    text,
  levels           integer,
  distancia_m      numeric,
  pontos           integer
)
language sql
stable
security definer
set search_path = public, publico, pg_temp
as $$
  select
    p.osm_id,
    p.name,
    p.addr_street,
    p.addr_housenumber,
    p.addr_postcode,
    p.levels,
    round(extensions.st_distance(p.centroide, i.geom)::numeric, 1) as distancia_m,
    (
      -- endereço completo no OSM é o sinal mais forte que temos hoje
      case when p.addr_street is not null and p.addr_housenumber is not null then 45
           when p.addr_street is not null then 20 else 0 end
      -- nome de condomínio abre o caminho do CNPJ (passo 4)
      + case when p.name is not null then 12 else 0 end
      -- prédio alto combina com apartamento; casa térrea não
      + case when p.levels >= 4 then 10 when p.levels is not null then 4 else 0 end
      -- quanto mais perto do ponto do anúncio, melhor
      + greatest(0, 30 - (extensions.st_distance(p.centroide, i.geom) / 5)::integer)
    )::integer as pontos
  from public.imoveis i
  join publico.osm_predios p
    on extensions.st_dwithin(p.centroide, i.geom, p_raio)
  where i.id = p_imovel_id
    and i.geom is not null
  order by pontos desc, distancia_m asc
  limit 40;
$$;

-- ------------------------------- passo 2: filtro cadastral (IPTU)
-- ★ É este JOIN que elimina 95% dos candidatos sem imagem, sem IA e sem API.
-- Fica devolvendo vazio até a carga da Fase 7 — e liga sozinho depois.
create or replace function public.filtrar_por_iptu(
  p_imovel_id uuid,
  p_raio      integer default 150
)
returns table (
  inscricao_imobiliaria text,
  logradouro            text,
  numero                text,
  unidade               text,
  pavimento             integer,
  area_construida       numeric,
  valor_venal           numeric,
  distancia_m           numeric
)
language sql
stable
security definer
set search_path = public, publico, pg_temp
as $$
  select
    q.inscricao_imobiliaria, q.logradouro, q.numero, q.unidade,
    q.pavimento, q.area_construida, q.valor_venal,
    round(extensions.st_distance(q.geom, i.geom)::numeric, 1)
  from public.imoveis i
  join publico.iptu_poa q
    on q.geom is not null
   and extensions.st_dwithin(q.geom, i.geom, p_raio)
  where i.id = p_imovel_id
    and i.geom is not null
    and i.area is not null
    -- a área da unidade bate com a do anúncio (±8%: o anúncio arredonda)
    and q.area_construida is not null
    and abs(q.area_construida - i.area) <= greatest(i.area * 0.08, 2)
  order by abs(q.area_construida - i.area), 8
  limit 10;
$$;

-- ------------------------------------------- grava o resultado do funil
create or replace function public.aplicar_endereco(
  p_imovel_id  uuid,
  p_logradouro text,
  p_numero     text,
  p_confianca  integer,
  p_metodo     text,
  p_inscricao  text default null,
  p_venal      numeric default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atual integer;
begin
  select endereco_confianca into v_atual
  from public.imoveis where id = p_imovel_id;

  -- nunca piorar um endereço que já foi resolvido com mais confiança
  if v_atual is not null and v_atual >= p_confianca then
    return false;
  end if;

  update public.imoveis set
    endereco              = coalesce(p_logradouro, endereco),
    endereco_numero       = coalesce(p_numero, endereco_numero),
    endereco_confianca    = p_confianca,
    endereco_metodo       = p_metodo,
    inscricao_imobiliaria = coalesce(p_inscricao, inscricao_imobiliaria),
    valor_venal           = coalesce(p_venal, valor_venal)
  where id = p_imovel_id;

  return true;
end;
$$;

revoke all on function publico.cachear_predios(jsonb)                     from public, anon, authenticated;
revoke all on function public.candidatos_endereco(uuid, integer)          from public, anon, authenticated;
revoke all on function public.filtrar_por_iptu(uuid, integer)             from public, anon, authenticated;
revoke all on function public.aplicar_endereco(uuid, text, text, integer, text, text, numeric) from public, anon, authenticated;

grant execute on function publico.cachear_predios(jsonb)                  to service_role;
grant execute on function public.candidatos_endereco(uuid, integer)       to service_role;
grant execute on function public.filtrar_por_iptu(uuid, integer)          to service_role;
grant execute on function public.aplicar_endereco(uuid, text, text, integer, text, text, numeric) to service_role;
