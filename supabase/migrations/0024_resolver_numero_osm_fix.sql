-- Dois consertos sobre a 0022, mantidos aqui como registro do que custou tempo:
--
-- 1) `search_path` sem `extensions`: postgis e pg_trgm vivem la, entao
--    st_dwithin/similarity davam 'type "geography" does not exist'. Funcao
--    SECURITY DEFINER tem search_path fixo — precisa listar `extensions`.
--
-- 2) Quem NAO casa precisa de marca. Sem isso o cron pega sempre as mesmas
--    linhas irresolviveis (o filtro e `endereco_numero is null`, que elas
--    nunca deixam de satisfazer) e nunca avanca.
--
-- ⚠️ Esta funcao foi DESCARTADA na 0025: mesmo consertada, ela gravava numero
--    de comercio vizinho. Ver o cabecalho da 0025.
create or replace function public.resolver_numero_osm(
  p_lote integer default 200, p_raio integer default 60)
returns jsonb language plpgsql security definer
set search_path = public, publico, extensions, pg_temp as $$
begin
  raise exception 'substituida por public.candidatos_numero (ver 0025)';
end; $$;
