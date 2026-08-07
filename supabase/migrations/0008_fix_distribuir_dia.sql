-- ImovelMap — Fase 2 · correcao do distribuir_imoveis_do_dia
--
-- BUG encontrado no teste: "INSERT has more target columns than expressions".
-- O insert lista (corretor_id, imovel_id, dia) e o select devolvia so duas
-- colunas — faltava o p_dia. Como a coluna `dia` tem default current_date,
-- o erro nao aparecia na leitura do codigo, so na execucao.
--
-- A 0005 ja nasce corrigida no arquivo; esta migration existe para o
-- historico local bater 1:1 com o que foi aplicado no projeto remoto.
-- Reaplicar e inofensivo (create or replace).

create or replace function public.distribuir_imoveis_do_dia(p_dia date default current_date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_corretor  record;
  v_ja        integer;
  v_restante  integer;
  v_inseridos integer;
  v_total     integer := 0;
begin
  for v_corretor in
    select id, cota_diaria from public.corretores
    where ativo is true
    order by created_at
  loop
    select count(*)::integer into v_ja
    from public.distribuicoes
    where corretor_id = v_corretor.id and dia = p_dia;

    v_restante := greatest(v_corretor.cota_diaria - v_ja, 0);
    continue when v_restante = 0;

    insert into public.distribuicoes (corretor_id, imovel_id, dia)
    select v_corretor.id, i.id, p_dia
    from public.imoveis i
    where i.is_active
      and not exists (
        select 1 from public.distribuicoes d where d.imovel_id = i.id
      )
    order by i.temperatura desc, i.first_seen_at desc
    limit v_restante
    on conflict (imovel_id, dia) do nothing;

    get diagnostics v_inseridos = row_count;
    v_total := v_total + v_inseridos;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.distribuir_imoveis_do_dia(date) from public;
grant execute on function public.distribuir_imoveis_do_dia(date) to service_role;
