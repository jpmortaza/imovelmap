-- ImovelMap — cadastro de endereços do OSM para o Rio Grande do Sul
--
-- ⭐ POR QUE ISSO EXISTE: a Rede Gaúcha publica rua e CEP, mas NUNCA o número
--    de porta — 17.792 anúncios com endereço pela metade. Sem número não há
--    inscrição imobiliária, sem inscrição não há matrícula, sem matrícula não
--    há nome do dono. O número é o gargalo do produto inteiro.
--
--    O CEP não resolve: testado, um CEP de POA cobre 24 a 40 prédios da mesma
--    rua. O que resolve é a COORDENADA, que a Rede Gaúcha dá de graça, casada
--    com um cadastro de endereços georreferenciado.
--
-- De onde vem o dado: extrato da Geofabrik (`sul-latest.osm.pbf`, 421 MB),
-- que é a forma que o OSM oferece para uso em massa. A alternativa —
-- consultar o Overpass em grade — levava ~6 h e castigava um espelho público.
--
-- Bônus que não estava no plano: `nome` traz o NOME DO CONDOMÍNIO quando o
-- prédio está mapeado. Nome de condomínio é chave de busca de CNPJ, e o CNPJ
-- do condomínio leva ao síndico — outra porta de entrada para o dono.

create table if not exists publico.osm_enderecos (
  id         bigserial primary key,
  rua        text not null,
  rua_nucleo text not null,          -- normalizado: sem acento, sem "Rua/Av", sem artigo
  numero     text not null,
  cep        text,
  cidade     text,
  bairro     text,
  nome       text,
  lat        double precision not null,
  lon        double precision not null,
  geom       geography(Point, 4326)
             generated always as (st_setsrid(st_makepoint(lon, lat), 4326)::geography) stored
);

create index if not exists osm_end_geom_idx   on publico.osm_enderecos using gist (geom);
create index if not exists osm_end_nucleo_idx on publico.osm_enderecos using gin (rua_nucleo gin_trgm_ops);
create index if not exists osm_end_cidade_idx on publico.osm_enderecos (cidade);

-- O repo é público e a anon key está à vista: tabela nova nasce fechada.
alter table publico.osm_enderecos enable row level security;
revoke all on publico.osm_enderecos from anon, authenticated;
revoke all on sequence publico.osm_enderecos_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Núcleo do nome da rua: o mesmo critério usado na EF do IPTU, em SQL, para
-- que os dois lados casem. "Avenida da Cavalhada" e "AV CAVALHADA" viram
-- ambos "CAVALHADA".
-- ---------------------------------------------------------------------------
create or replace function publico.nucleo_rua(p text)
returns text
language sql immutable
set search_path = pg_catalog, public
as $$
  select nullif(trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        upper(public.unaccent_simples(coalesce(p, ''))),
        '^(RUA|R\.|AVENIDA|AV\.?|TRAVESSA|TV\.?|PRACA|ESTRADA|ROD(OVIA)?|BECO|LARGO|ALAMEDA|AL\.?)\s+', ''),
      '\y(DA|DE|DO|DAS|DOS|E)\y', ' ', 'g'),
    '[^A-Z0-9]+', ' ', 'g')), '');
$$;

-- unaccent como extensão exigiria instalar no schema certo; para o pouco que
-- precisamos, translate resolve e não adiciona dependência.
create or replace function public.unaccent_simples(p text)
returns text
language sql immutable
set search_path = pg_catalog
as $$
  select translate(coalesce(p, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC');
$$;

revoke all on function publico.nucleo_rua(text)     from public, anon, authenticated;
revoke all on function public.unaccent_simples(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- `resolver_numero_osm` — dá número de porta a quem só tem rua e coordenada.
--
-- Regra de casamento, do mais forte para o mais fraco:
--   · ponto de endereço a menos de `p_raio` metros
--   · nome da rua batendo por trigrama (>= 0,55) — evita pegar o número do
--     prédio da rua de trás, que é o erro clássico de casar só por distância
--   · o mais perto vence; a confiança cai com a distância
--
-- Não sobrescreve número que já existe: portal que informa número é sempre
-- mais confiável que inferência geográfica.
-- ---------------------------------------------------------------------------
create or replace function public.resolver_numero_osm(
  p_lote integer default 200,
  p_raio integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, publico, pg_temp
as $$
declare
  v_resolvidos integer := 0;
  v_tentados   integer := 0;
  r record;
  m record;
begin
  for r in
    select i.id, i.endereco, i.latitude, i.longitude,
           publico.nucleo_rua(i.endereco) nucleo
      from public.imoveis i
     where i.endereco_numero is null
       and i.endereco is not null
       and i.latitude is not null
       and i.longitude is not null
     limit p_lote
  loop
    v_tentados := v_tentados + 1;

    select o.numero, o.cep, o.nome, o.bairro,
           st_distance(o.geom, st_setsrid(st_makepoint(r.longitude, r.latitude), 4326)::geography) dist,
           similarity(o.rua_nucleo, r.nucleo) sim
      into m
      from publico.osm_enderecos o
     where st_dwithin(o.geom,
                      st_setsrid(st_makepoint(r.longitude, r.latitude), 4326)::geography,
                      p_raio)
       and r.nucleo is not null
       and similarity(o.rua_nucleo, r.nucleo) >= 0.55
     order by st_distance(o.geom, st_setsrid(st_makepoint(r.longitude, r.latitude), 4326)::geography)
     limit 1;

    if m.numero is not null then
      update public.imoveis
         set endereco_numero   = m.numero,
             cep               = coalesce(cep, m.cep),
             complemento       = coalesce(complemento, m.nome),
             endereco_metodo   = 'osm-numero',
             endereco_confianca = greatest(coalesce(endereco_confianca, 0),
                                  case when m.dist <= 15 then 85
                                       when m.dist <= 30 then 72
                                       else 60 end),
             updated_at = now()
       where id = r.id;
      v_resolvidos := v_resolvidos + 1;
    end if;
  end loop;

  return jsonb_build_object('tentados', v_tentados, 'resolvidos', v_resolvidos);
end;
$$;

revoke all on function public.resolver_numero_osm(integer, integer)
  from public, anon, authenticated;
grant execute on function public.resolver_numero_osm(integer, integer) to service_role;
