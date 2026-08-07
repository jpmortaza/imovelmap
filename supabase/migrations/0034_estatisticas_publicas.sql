-- Números para a vitrine pública (`/`).
--
-- ⚠️ SÓ AGREGADO. Nenhum endereço, nenhuma coordenada, nenhum anúncio
--    individual. A regra de sempre: o endereço é o produto, e o mapa —
--    que mostra posição, o que já é nosso e o que é da concorrência — saiu
--    de `/` e foi para `/mapa`, atrás do login. Aberto, ele entregaria a
--    carteira e o resultado do enriquecimento para qualquer concorrente.
--
-- A função é chamada pelo componente de servidor da home com a service_role;
-- `anon` não executa nada aqui.

create or replace function public.estatisticas_publicas()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'total',        (select count(*) from public.imoveis where is_active),
    'venda',        (select count(*) from public.imoveis where is_active and transaction_type = 'sale'),
    'aluguel',      (select count(*) from public.imoveis where is_active and transaction_type = 'rent'),
    'cidades',      (select count(distinct city) from public.imoveis
                      where is_active and city is not null),
    'bairros',      (select count(distinct neighborhood) from public.imoveis
                      where is_active and neighborhood is not null),
    'fontes',       (select count(distinct source) from public.imoveis where is_active),
    'atualizado',   (select max(last_seen_at) from public.imoveis),
    'precoMediano', (select percentile_cont(0.5) within group (order by price)
                       from public.imoveis
                      where is_active and transaction_type = 'sale' and price > 10000),
    -- mediana com menos de 30 anúncios não diz nada; o corte é deliberado
    'topBairros',   (select jsonb_agg(x) from (
                       select neighborhood bairro, count(*) n,
                              round(percentile_cont(0.5) within group (order by price))::bigint mediana
                         from public.imoveis
                        where is_active and transaction_type = 'sale'
                          and neighborhood is not null and price > 10000
                          and city ilike '%porto alegre%'
                        group by 1
                       having count(*) >= 30
                        order by 2 desc
                        limit 12) x)
  );
$$;

revoke all on function public.estatisticas_publicas() from public, anon, authenticated;
grant execute on function public.estatisticas_publicas() to service_role;
