-- Sobrepreço: quanto o anúncio pede acima do que o PRÓPRIO PRÉDIO vendeu.
--
-- ⭐ Por que é o melhor sinal de agenciamento que temos: imóvel muito acima do
--    que o prédio transaciona NÃO SAI. E dono de imóvel encalhado já tentou do
--    jeito dele, não deu, e é quem escuta um corretor.
--
-- ⚠️ DOIS FILTROS QUE NÃO SÃO OPCIONAIS — a primeira versão sem eles produziu
--    "1.218% acima do mercado" para um apartamento comum:
--
--  1) `perc_transmitido = 100`. A base de cálculo do ITBI é PROPORCIONAL à
--     fração transmitida. Medido: transmissões de 50% têm mediana R$2.209/m²
--     contra R$4.696/m² das de 100% — exatamente metade. As ~4.500 linhas de
--     transmissão parcial derrubavam a mediana do prédio, e aí qualquer
--     anúncio normal parecia absurdo.
--
--  2) Faixa plausível dos DOIS lados. Mesmo em transmissão integral o cadastro
--     tem R$0/m² e R$35 milhões/m² (área errada, doação simbólica, permuta) —
--     uma linha dessas move a mediana de um prédio pequeno. E o portal também
--     publica lixo: apartamento de 74 m² anunciado a R$112 milhões.
--
-- Depois dos filtros a mediana de POA fica em R$4.401/m², que é mercado real.
--
-- Limitação conhecida, deliberada: a referência é a mediana do PRÉDIO INTEIRO.
-- Cobertura acima da mediana do prédio é normal, não sobrepreço. Por isso o
-- sinal vale 20 de 100 na temperatura, não decide sozinho.

create materialized view if not exists publico.itbi_referencia as
select rua_nucleo, n_endereco,
       count(*) n_transacoes,
       percentile_cont(0.5) within group (
         order by base_de_calculo / area_privativa) mediana_m2,
       max(data_estimativa) ultima
  from publico.itbi
 where base_de_calculo > 0
   and area_privativa > 20
   and perc_transmitido = 100
   and base_de_calculo / area_privativa between 500 and 40000
   and data_estimativa >= current_date - interval '3 years'
   and n_endereco is not null and rua_nucleo is not null
 group by 1,2
having count(*) >= 3;

create unique index if not exists itbi_ref_idx on publico.itbi_referencia (rua_nucleo, n_endereco);
revoke all on publico.itbi_referencia from anon, authenticated;

alter table public.imoveis
  add column if not exists preco_ref_m2 numeric,
  add column if not exists sobrepreco   numeric;   -- 0.35 = pede 35% acima do prédio
grant select (preco_ref_m2, sobrepreco) on public.imoveis to authenticated;

create or replace function public.calcular_sobrepreco(p_lote integer default 20000)
returns integer language plpgsql security definer
set search_path = public, publico, extensions, pg_temp as $$
declare v_n integer;
begin
  with alvo as (
    select i.id, publico.nucleo_rua(i.endereco) nucleo,
           regexp_replace(i.endereco_numero, '\D','','g') num,
           (i.price / nullif(i.area,0))::numeric pedido_m2
      from public.imoveis i
     where i.transaction_type = 'sale'
       and i.price > 0 and i.area > 20
       and i.endereco_numero is not null and i.endereco is not null
       and i.sobrepreco is null
     limit p_lote),
  casado as (
    select a.id, r.mediana_m2::numeric mediana_m2,
           (a.pedido_m2 / r.mediana_m2::numeric - 1) sobre
      from alvo a
      join publico.itbi_referencia r
        on r.n_endereco = a.num and r.rua_nucleo = a.nucleo
     where a.pedido_m2 between 500 and 60000)
  update public.imoveis i
     set preco_ref_m2 = round(casado.mediana_m2, 2),
         sobrepreco   = round(casado.sobre, 4),
         updated_at   = now()
    from casado where i.id = casado.id;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

-- Temperatura v2 — quatro sinais em 100:
--   sem exclusiva (vários portais) 30 · queda de preço 25
--   tempo no mercado 25            · sobrepreço 20
-- Calibrado na distribuição real (n=18.488): o pedido fica em mediana +23%
-- acima do transacionado, p75 +43%, p90 +67%. Então "caro" começa depois de
-- +25% (o prêmio normal de anúncio) e satura em +75%.
create or replace function public.calcular_temperatura(p_imovel_id uuid)
returns integer language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_ids uuid[]; v_portais integer := 1; v_dias integer := 0;
  v_queda numeric := 0; v_sobre numeric; v_temp integer;
begin
  select coalesce(array_agg(distinct g2.imovel_id), array[p_imovel_id]) into v_ids
    from public.imovel_grupos g1
    join public.imovel_grupos g2 on g2.grupo_id = g1.grupo_id
   where g1.imovel_id = p_imovel_id;
  if v_ids is null or array_length(v_ids, 1) is null then v_ids := array[p_imovel_id]; end if;

  select greatest(count(distinct source), 1) into v_portais
    from public.imoveis where id = any(v_ids);
  select greatest(extract(day from now() - min(first_seen_at))::integer, 0) into v_dias
    from public.imoveis where id = any(v_ids);
  select coalesce(max(q.queda), 0) into v_queda from (
    select case when max(price) > 0 then (max(price) - min(price)) / max(price) * 100 else 0 end queda
      from public.imovel_precos where imovel_id = any(v_ids) group by imovel_id) q;
  select max(sobrepreco) into v_sobre from public.imoveis where id = any(v_ids);

  v_temp := least(100,
      least((v_portais - 1) * 20, 30)
    + least(round(greatest(v_queda, 0) * 3)::integer, 25)
    + least(round(coalesce(v_dias, 0) * 0.5)::integer, 25)
    + case when v_sobre is null then 0
           else least(greatest(round((v_sobre - 0.25) * 40)::integer, 0), 20) end);

  update public.imoveis set temperatura = v_temp where id = any(v_ids);
  return v_temp;
end; $$;

-- Sem ORDER BY nem OFFSET o lote pega sempre as MESMAS linhas: idempotente,
-- mas nunca avança. Já perdi sete lotes assim.
create or replace function public.recalcular_temperaturas(
  p_lote integer default 3000, p_desloc integer default 0)
returns integer language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_n integer := 0; r record;
begin
  for r in select id from public.imoveis
            where sobrepreco is not null and is_active
            order by id limit p_lote offset p_desloc loop
    perform public.calcular_temperatura(r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;

revoke all on function public.calcular_sobrepreco(integer)              from public, anon, authenticated;
revoke all on function public.calcular_temperatura(uuid)                from public, anon, authenticated;
revoke all on function public.recalcular_temperaturas(integer, integer) from public, anon, authenticated;
grant execute on function public.calcular_sobrepreco(integer)              to service_role;
grant execute on function public.recalcular_temperaturas(integer, integer) to service_role;
