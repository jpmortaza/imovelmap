-- ImovelMap — Fase 11 · coleta automática da Rede Gaúcha
--
-- Este portal não bloqueia IP de datacenter, então não precisa de extensão,
-- de navegador nem de máquina ligada: o banco chama a EF sozinho.
--
-- Ritmo: 60 imóveis a cada 10 minutos = ~8.600/dia. O catálogo inteiro
-- (~19.900) leva ~2,3 dias e então recomeça — e é isso que queremos, porque
-- a segunda passada é que detecta **mudança de preço**, que é o sinal mais
-- valioso do produto.
--
-- Devagar de propósito: a Rede Gaúcha é parceira do negócio, não um alvo.

create table if not exists public.coleta_cursor (
  fonte         text primary key,
  posicao       integer not null default 0,
  voltas        integer not null default 0,
  atualizado_em timestamptz not null default now()
);

alter table public.coleta_cursor enable row level security;
revoke all on public.coleta_cursor from anon, authenticated;

insert into public.coleta_cursor (fonte, posicao)
values ('redegauchadeimoveis.com.br', 0)
on conflict (fonte) do nothing;

-- A chave de serviço fica no Vault, nunca no corpo da função.
-- ⚠️ Ao ROTACIONAR a chave no dashboard, atualize aqui também:
--    select vault.update_secret(
--      (select id from vault.secrets where name = 'service_role_key'),
--      '<chave nova>');
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'service_role_key') then
    perform vault.create_secret('TROCAR', 'service_role_key',
      'Chave de servico usada pelo pg_cron para chamar as Edge Functions');
  end if;
end $$;

create or replace function public.coletar_rgi_tick()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lote     integer := 60;
  v_pos      integer;
  v_voltas   integer;
  v_chave    text;
  v_req      bigint;
  v_total    integer := 19942;  -- tamanho aproximado do sitemap
begin
  select decrypted_secret into v_chave
  from vault.decrypted_secrets where name = 'service_role_key';

  if v_chave is null or v_chave = 'TROCAR' then
    raise notice 'coletar_rgi_tick: chave de servico nao configurada no Vault';
    return null;
  end if;

  select posicao, voltas into v_pos, v_voltas
  from public.coleta_cursor where fonte = 'redegauchadeimoveis.com.br'
  for update;

  select net.http_post(
    url     := 'https://jmtrkygcndaqnrgobnqo.supabase.co/functions/v1/coletar-rgi',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_chave),
    body    := jsonb_build_object('inicio', v_pos, 'limite', v_lote),
    timeout_milliseconds := 120000
  ) into v_req;

  -- avanca otimista: pg_net e assincrono, nao da para esperar a resposta.
  -- Se um lote falhar, ele volta na proxima volta do catalogo.
  if v_pos + v_lote >= v_total then
    update public.coleta_cursor
       set posicao = 0, voltas = v_voltas + 1, atualizado_em = now()
     where fonte = 'redegauchadeimoveis.com.br';
  else
    update public.coleta_cursor
       set posicao = v_pos + v_lote, atualizado_em = now()
     where fonte = 'redegauchadeimoveis.com.br';
  end if;

  return v_req;
end;
$$;

revoke all on function public.coletar_rgi_tick() from public, anon, authenticated;
grant execute on function public.coletar_rgi_tick() to service_role;

select cron.unschedule('imovelmap-rgi')
  where exists (select 1 from cron.job where jobname = 'imovelmap-rgi');

select cron.schedule('imovelmap-rgi', '*/10 * * * *',
  $$ select public.coletar_rgi_tick(); $$);
