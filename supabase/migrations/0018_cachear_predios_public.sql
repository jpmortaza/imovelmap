-- ImovelMap — `cachear_predios` precisa morar em `public`
--
-- BUG encontrado no teste da Fase 8: a EF chamava `rpc("cachear_predios")` e
-- o cache continuava vazio, sem erro visível.
--
-- Causa: o PostgREST só expõe o schema `public` (e `graphql_public`). A função
-- estava em `publico`, então `/rest/v1/rpc/cachear_predios` dava 404 — e a EF
-- ignorava o erro do rpc, o que transformou uma falha em silêncio.
--
-- Regra que fica: TODA função chamada por EF via supabase-js precisa estar em
-- `public`. O schema `publico` guarda dados, não interface.

create or replace function public.cachear_predios(p_predios jsonb)
returns integer
language plpgsql
security definer
set search_path = public, publico, pg_temp
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

-- a versão em `publico` sai de cena para não haver duas verdades
drop function if exists publico.cachear_predios(jsonb);

revoke all on function public.cachear_predios(jsonb) from public, anon, authenticated;
grant execute on function public.cachear_predios(jsonb) to service_role;
