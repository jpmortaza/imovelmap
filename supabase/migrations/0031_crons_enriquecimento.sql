-- Enriquecimento contínuo: o que foi feito à mão esta noite passa a rodar só.
--
-- Todos os ticks são SQL puro, sem HTTP — não dependem da chave de serviço no
-- Vault nem de Edge Function no ar. Um cron a menos para parar em silêncio.

create or replace function public.casar_itbi_tick()
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare i integer;
begin
  for i in 1..8 loop
    perform public.casar_itbi_lote(250, 0.05);
  end loop;
end; $$;

create or replace function public.enriquecer_tick()
returns jsonb language plpgsql security definer
set search_path = public, publico, pg_temp as $$
declare v_nome integer; v_sobre integer;
begin
  v_nome  := public.nomear_condominios(5000);   -- nome do prédio para quem ganhou número
  v_sobre := public.calcular_sobrepreco(5000);  -- referência de preço do prédio
  return jsonb_build_object('nomeados', v_nome, 'sobrepreco', v_sobre);
end; $$;

-- A referência de preço muda pouco: um refresh por dia basta, e só faz sentido
-- depois que a coleta da madrugada entrou.
create or replace function public.refresh_itbi_referencia()
returns void language plpgsql security definer
set search_path = publico, pg_temp as $$
begin
  refresh materialized view concurrently publico.itbi_referencia;
end; $$;

revoke all on function public.casar_itbi_tick()        from public, anon, authenticated;
revoke all on function public.enriquecer_tick()        from public, anon, authenticated;
revoke all on function public.refresh_itbi_referencia() from public, anon, authenticated;

select cron.unschedule(jobname) from cron.job
 where jobname in ('imovelmap-itbi','imovelmap-enriquecer','imovelmap-referencia');

select cron.schedule('imovelmap-itbi',       '*/15 * * * *', $$ select public.casar_itbi_tick(); $$);
select cron.schedule('imovelmap-enriquecer', '7,37 * * * *', $$ select public.enriquecer_tick(); $$);
select cron.schedule('imovelmap-referencia', '40 6 * * *',   $$ select public.refresh_itbi_referencia(); $$);

-- o IPTU vira complemento: o ITBI dá área privativa (a que o anúncio publica)
-- e ainda entrega a matrícula, que o IPTU não tem
select cron.alter_job((select jobid from cron.job where jobname='imovelmap-iptu'),
                      schedule := '*/20 * * * *');
