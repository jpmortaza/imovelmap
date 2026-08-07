-- ImovelMap — Fase 12 (parcial) · automacao por pg_cron
--
-- A rotina diaria sai do Vercel Cron e vem para dentro do banco. Motivos:
-- nao depende do deploy do frontend estar de pe (hoje nao esta), nao precisa
-- de CRON_SECRET, e nao ha viagem de rede entre quem agenda e quem executa.
--
-- A rota /api/cron/distribuir continua funcionando e vira redundante — as
-- duas RPCs sao idempotentes (unique (imovel_id, dia) e o on conflict do
-- match), entao rodar duas vezes nao duplica nada.
--
-- Horarios em UTC: 09:00 UTC = 06:00 em Brasilia, antes do corretor comecar.

-- Agrupar so o que foi visto nas ultimas 24h. A varredura completa e
-- quadratica; nao faz sentido reprocessar a base inteira de hora em hora.
create or replace function public.agrupar_duplicatas_recentes()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id      uuid;
  v_ligados integer := 0;
begin
  for v_id in
    select id from public.imoveis
    where is_active and last_seen_at > now() - interval '24 hours'
    order by last_seen_at desc
    limit 5000
  loop
    v_ligados := v_ligados + public.agrupar_duplicatas(v_id);
  end loop;
  return v_ligados;
end;
$$;

revoke all on function public.agrupar_duplicatas_recentes() from public, anon, authenticated;
grant execute on function public.agrupar_duplicatas_recentes() to service_role;

-- ------------------------------------------------------------- agendamentos
-- (unschedule antes, para a migration poder ser reaplicada sem erro)
select cron.unschedule('imovelmap-distribuir')
  where exists (select 1 from cron.job where jobname = 'imovelmap-distribuir');
select cron.unschedule('imovelmap-agrupar')
  where exists (select 1 from cron.job where jobname = 'imovelmap-agrupar');

-- 06:00 BRT — monta a carteira do dia e dispara os alertas
select cron.schedule(
  'imovelmap-distribuir',
  '0 9 * * *',
  $$
    select public.distribuir_imoveis_do_dia(current_date);
    select public.match_alertas_novos(current_date);
  $$
);

-- de 2 em 2 horas — cruza o que a extensao capturou desde a ultima rodada
select cron.schedule(
  'imovelmap-agrupar',
  '15 */2 * * *',
  $$ select public.agrupar_duplicatas_recentes(); $$
);
