-- ImovelMap — Fase 2 · correcao de privilegio de execucao
--
-- BUG encontrado no teste: com apenas
--     revoke all on function ... from public;
-- o papel `anon` AINDA conseguia chamar upsert_imovel.
--
-- Motivo: o Supabase nao concede execute so via PUBLIC — ele tem
-- ALTER DEFAULT PRIVILEGES concedendo EXECUTE diretamente a anon,
-- authenticated e service_role em toda funcao nova do schema public.
-- Revogar de PUBLIC nao mexe num grant direto ao papel.
--
-- Sem isto, qualquer visitante do site poderia injetar imovel na base
-- chamando a RPC pelo endpoint publico do PostgREST com a anon key —
-- que, sendo o repo publico, esta a vista de todo mundo.

-- fecha tudo, para os dois papeis
revoke all on all functions in schema public from anon, authenticated;

-- e para as funcoes criadas daqui pra frente por migration
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

-- reabre so o necessario para o corretor logado
grant execute on function public.get_lease_atual(date)               to authenticated;
grant execute on function public.marcar_trabalhado(uuid, text, text) to authenticated;
-- usadas dentro das policies de RLS: sem execute, a policy falha
grant execute on function public.is_super_admin()                    to authenticated;
grant execute on function public.is_corretor_ativo()                 to authenticated;

-- backend continua com tudo
grant execute on all functions in schema public to service_role;

-- anon: nenhuma funcao. O mapa publico le tabela, nao chama RPC.
