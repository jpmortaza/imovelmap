-- ImovelMap — temperatura calculada sobre o GRUPO, nao sobre o anuncio
--
-- Achado no teste do agrupar_duplicatas: o mesmo apartamento em 3 portais
-- ficava com temperatura 64 no ZAP (onde o preco caiu) e 40 no VivaReal e
-- na OLX. Mas e o MESMO imovel: quem abre o anuncio do VivaReal precisa ver
-- "caiu 7,9%" do mesmo jeito — e esse o ponto do HUD (PROJETO.md §3.3).
--
-- Agora os tres eixos olham o grupo inteiro:
--   portais    quantas fontes distintas anunciam o imovel
--   queda      maior queda percentual observada em QUALQUER anuncio dele
--   dias       desde a primeira vez que ele apareceu em QUALQUER portal

create or replace function public.calcular_temperatura(p_imovel_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids     uuid[];
  v_portais integer := 1;
  v_dias    integer := 0;
  v_queda   numeric := 0;
  v_temp    integer;
begin
  -- o imovel e todos os anuncios dele (ou so ele, se ainda nao tem grupo)
  select coalesce(array_agg(distinct g2.imovel_id), array[p_imovel_id])
    into v_ids
  from public.imovel_grupos g1
  join public.imovel_grupos g2 on g2.grupo_id = g1.grupo_id
  where g1.imovel_id = p_imovel_id;

  if v_ids is null or array_length(v_ids, 1) is null then
    v_ids := array[p_imovel_id];
  end if;

  -- 1. em quantos portais aparece = forca do "sem exclusiva"
  select greatest(count(distinct source), 1) into v_portais
  from public.imoveis where id = any(v_ids);

  -- 2. dias desde a primeira aparicao em qualquer portal
  select greatest(extract(day from now() - min(first_seen_at))::integer, 0)
    into v_dias
  from public.imoveis where id = any(v_ids);

  -- 3. maior queda percentual vista em qualquer anuncio do grupo
  select coalesce(max(q.queda), 0) into v_queda
  from (
    select case
             when max(price) > 0 then (max(price) - min(price)) / max(price) * 100
             else 0
           end as queda
    from public.imovel_precos
    where imovel_id = any(v_ids)
    group by imovel_id
  ) q;

  v_temp := least(
    100,
    least((v_portais - 1) * 20, 40)                            -- sem exclusiva
    + least(round(greatest(v_queda, 0) * 3)::integer, 30)       -- preco caindo
    + least(round(coalesce(v_dias, 0) * 0.5)::integer, 30)      -- tempo parado
  );

  -- o grupo inteiro esfria e esquenta junto
  update public.imoveis set temperatura = v_temp where id = any(v_ids);
  return v_temp;
end;
$$;

revoke all on function public.calcular_temperatura(uuid) from public, anon, authenticated;
grant execute on function public.calcular_temperatura(uuid) to service_role;
