-- Bairro: preencher quem não tem, e normalizar a grafia.
--
-- ⚠️ DOIS BUGS QUE SE ESCONDIAM UM ATRÁS DO OUTRO, e nenhum dava erro.
--
-- 1) A REDE GAÚCHA TINHA 0% DE BAIRRO. 19.715 imóveis, 18.356 deles
--    OPORTUNIDADE, e o painel do corretor filtra por `neighborhood in
--    (bairros)`. A maior fonte da base estava 100% invisível desde que o
--    painel foi criado — e o mapa mostrava pinos normalmente, todos de outra
--    fonte, então nada indicava o problema. Causa: `coletar-rgi` nunca
--    extraiu o bairro (o schema.org do portal traz `addressLocality`, que é
--    a cidade).
--
--    Conserto sem revisitar 19 mil páginas: o ITBI da prefeitura tem CEP E
--    bairro, e a Rede Gaúcha tem CEP. É lookup, não inferência — um CEP
--    pertence a um bairro só. 10.485 por CEP + 4.008 por vizinhança (400 m,
--    exigindo 70% de concordância e ao menos 5 vizinhos).
--
--    ⚠️ A grafia importa: o ITBI escreve "MENINO DEUS" e os portais
--       "Menino Deus", e o filtro compara texto EXATO. Gravar a grafia do
--       ITBI teria dado exatamente o mesmo resultado do bug original.
--
-- 2) O MESMO BAIRRO APARECIA ATÉ 5 VEZES no seletor: "Centro Histórico",
--    "centro historico", "CENTRO HISTÓRICO"… O admin escolhia uma e o
--    corretor perdia os imóveis das outras. A grafia dominante é sempre a
--    certa (Centro Histórico 4.199 contra 1 a 3 das variantes; Hípica 1.601
--    contra Hipica 194), então "mais comum vence" resolve sem heurística.
--    744 bairros distintos viraram 653.

create materialized view if not exists publico.cep_bairro as
select cep, (array_agg(bairro order by n desc))[1] bairro, sum(n) transacoes
  from (select cep, bairro, count(*) n from publico.itbi
         where cep is not null and bairro is not null group by 1,2) t
 group by cep;
create unique index if not exists cep_bairro_idx on publico.cep_bairro (cep);
revoke all on publico.cep_bairro from anon, authenticated;

-- grafia canônica = a dos portais, que é o que o filtro do painel compara
create materialized view if not exists publico.bairro_canonico as
with portais as (
  select neighborhood nome, count(*) n from public.imoveis
   where neighborhood is not null and city ilike '%porto alegre%' group by 1)
select upper(public.unaccent_simples(nome)) chave, nome, n
  from (select nome, n, row_number() over (
          partition by upper(public.unaccent_simples(nome)) order by n desc) r
          from portais) t
 where r = 1;
create unique index if not exists bairro_can_idx on publico.bairro_canonico (chave);
revoke all on publico.bairro_canonico from anon, authenticated;

create or replace function public.preencher_bairros()
returns jsonb language plpgsql security definer
set search_path = public, publico, extensions, pg_temp as $$
declare v_cep integer; v_geo integer;
begin
  with alvo as (
    select i.id, b.nome
      from public.imoveis i
      join publico.cep_bairro c on c.cep = regexp_replace(coalesce(i.cep,''),'\D','','g')
      join publico.bairro_canonico b
        on b.chave = upper(public.unaccent_simples(c.bairro))
     where i.neighborhood is null)
  update public.imoveis i set neighborhood = alvo.nome, updated_at = now()
    from alvo where i.id = alvo.id;
  get diagnostics v_cep = row_count;

  with alvo as (
    select id, latitude la, longitude lo from public.imoveis
     where neighborhood is null and latitude is not null
       and latitude between -33.9 and -27.0 and longitude between -57.7 and -49.6
     limit 20000),
  voto as (
    select a.id, v.neighborhood, count(*) n,
           row_number() over (partition by a.id order by count(*) desc) r,
           sum(count(*)) over (partition by a.id) total
      from alvo a
      join public.imoveis v
        on v.neighborhood is not null
       and st_dwithin(v.geom, st_setsrid(st_makepoint(a.lo, a.la),4326)::geography, 400)
     group by a.id, v.neighborhood)
  update public.imoveis i set neighborhood = voto.neighborhood, updated_at = now()
    from voto where i.id = voto.id and voto.r = 1
      and voto.total >= 5 and voto.n::numeric / voto.total >= 0.70;
  get diagnostics v_geo = row_count;

  return jsonb_build_object('porCep', v_cep, 'porVizinhanca', v_geo);
end; $$;

create or replace function public.normalizar_bairros()
returns jsonb language plpgsql security definer
set search_path = public, publico, pg_temp as $$
declare v_imoveis integer; v_corretores integer; v_antes integer; v_depois integer;
begin
  select count(distinct neighborhood) into v_antes from public.imoveis;

  create temp table canon on commit drop as
  select chave, nome from (
    select upper(public.unaccent_simples(trim(neighborhood))) chave,
           trim(neighborhood) nome,
           row_number() over (
             partition by upper(public.unaccent_simples(trim(neighborhood)))
             order by count(*) desc, length(trim(neighborhood)) desc) r
      from public.imoveis where neighborhood is not null
     group by 1,2) t
   where r = 1;

  update public.imoveis i set neighborhood = c.nome, updated_at = now()
    from canon c
   where c.chave = upper(public.unaccent_simples(trim(i.neighborhood)))
     and i.neighborhood <> c.nome;
  get diagnostics v_imoveis = row_count;

  -- território já atribuído também precisa: havia "Cristal", "CRISTAL" e
  -- "cristal" selecionados ao mesmo tempo no mesmo corretor
  update public.corretores co
     set bairros = sub.b, updated_at = now()
    from (select co2.id,
                 array(select distinct coalesce(c.nome, x)
                         from unnest(co2.bairros) x
                         left join canon c
                           on c.chave = upper(public.unaccent_simples(trim(x)))
                        order by 1) b
            from public.corretores co2
           where coalesce(array_length(co2.bairros,1),0) > 0) sub
   where co.id = sub.id and co.bairros <> sub.b;
  get diagnostics v_corretores = row_count;

  select count(distinct neighborhood) into v_depois from public.imoveis;
  return jsonb_build_object('imoveisAjustados', v_imoveis,
    'corretoresAjustados', v_corretores,
    'bairrosAntes', v_antes, 'bairrosDepois', v_depois);
end; $$;

revoke all on function public.preencher_bairros()  from public, anon, authenticated;
revoke all on function public.normalizar_bairros() from public, anon, authenticated;
grant execute on function public.preencher_bairros()  to service_role;
grant execute on function public.normalizar_bairros() to service_role;
