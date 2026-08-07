-- ImovelMap — Fase 7 destravada: IPTU por API, sem baixar 225 MB
--
-- ⭐ dadosabertos.poa.br roda CKAN com DATASTORE ATIVO. Os 876.298 registros
-- do IPTU 2026 sao consultaveis por SQL via `datastore_search_sql`, de graca
-- e sem chave. O plano previa baixar o CSV de 225 MB e carregar por psql —
-- o que travou o projeto porque exige a senha do banco. Nao precisa.
--
-- Recurso IPTU 2026: 1129ea5b-bf51-4102-a115-756343e86d27
--
-- A EF `enriquecer-iptu` casa (logradouro, numero) do anuncio com o cadastro
-- e grava valor venal + inscricao imobiliaria — a chave da matricula.
--
-- ⚠️ ARMADILHA QUE CUSTOU UMA RODADA: predio de 400 unidades tem a maioria
--    dos registros como BOX DE GARAGEM (11 m²). Casar area sem filtrar isso
--    gravava a inscricao da garagem, e o corretor pagaria R$ 50-100 pela
--    matricula errada. Hoje: descarta area < 25 m² e uso de garagem/deposito,
--    e quando NAO identifica a unidade grava so o lote com valor venal NULL.

create or replace function public.enriquecer_iptu_tick()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_chave text;
  v_req   bigint;
begin
  select decrypted_secret into v_chave
  from vault.decrypted_secrets where name = 'service_role_key';
  if v_chave is null then
    raise notice 'enriquecer_iptu_tick: chave de servico ausente no Vault';
    return null;
  end if;

  select net.http_post(
    url     := 'https://jmtrkygcndaqnrgobnqo.supabase.co/functions/v1/enriquecer-iptu',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || v_chave),
    body    := jsonb_build_object('lote', 30),
    timeout_milliseconds := 180000
  ) into v_req;
  return v_req;
end;
$$;

revoke all on function public.enriquecer_iptu_tick() from public, anon, authenticated;
grant execute on function public.enriquecer_iptu_tick() to service_role;

select cron.unschedule('imovelmap-iptu')
  where exists (select 1 from cron.job where jobname = 'imovelmap-iptu');

select cron.schedule('imovelmap-iptu', '*/5 * * * *',
  $$ select public.enriquecer_iptu_tick(); $$);
