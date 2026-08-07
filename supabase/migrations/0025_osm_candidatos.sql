-- O OSM da CANDIDATOS, nao respostas.
--
-- ⚠️ LICAO CARA: a primeira versao gravava direto "o ponto de endereco mais
--    proximo na mesma rua". Resultado real, conferido antes de escalar:
--
--      Rua Mostardeiro 375   → complemento "Mercado Morari"
--      Av. Venancio Aires 859 → complemento "Alice's Bar"
--      Av. Joao Pessoa 1027   → complemento "Padaria Joao Pessoa"
--      numero "3033 sala 609", numero "7000/7020/7040/7060"
--
--    No Brasil o OSM mapeia COMERCIO muito mais do que predio residencial, e
--    a padaria da esquina fica a 12 m do edificio. Gravamos 76 numeros de
--    vizinho com confianca 85 antes de olhar. Desfeito.
--
-- O conserto nao e ajustar o raio — e parar de tratar o OSM como resposta.
-- Ele lista numeros plausiveis; quem decide qual e o predio certo e o ITBI,
-- cruzando a area privativa (ver 0027). Duas fontes independentes concordando.
truncate publico.osm_enderecos;

alter table publico.osm_enderecos
  add column if not exists numero_limpo text,   -- inteiro inicial: chave do IPTU/ITBI
  add column if not exists predio       text,   -- tag `building`: e moradia?
  add column if not exists poi          boolean default false;

create index if not exists osm_end_predio_idx on publico.osm_enderecos (predio)
  where predio is not null;

create or replace function public.candidatos_numero(
  p_lat double precision, p_lon double precision, p_rua text,
  p_raio integer default 80, p_max integer default 8)
returns table (numero text, dist double precision, predio text, nome text, cep text)
language sql stable security definer
set search_path = public, publico, extensions, pg_temp as $$
  with alvo as (select st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography g,
                       publico.nucleo_rua(p_rua) nucleo)
  select distinct on (o.numero_limpo)
         o.numero_limpo, st_distance(o.geom, alvo.g), o.predio, o.nome, o.cep
    from publico.osm_enderecos o, alvo
   where alvo.nucleo is not null
     and st_dwithin(o.geom, alvo.g, p_raio)
     and similarity(o.rua_nucleo, alvo.nucleo) >= 0.55
   order by o.numero_limpo, (o.predio is null), st_distance(o.geom, alvo.g)
   limit p_max;
$$;

revoke all on function public.candidatos_numero(double precision, double precision, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.candidatos_numero(double precision, double precision, text, integer, integer)
  to service_role;

drop function if exists public.resolver_numero_osm(integer, integer);
