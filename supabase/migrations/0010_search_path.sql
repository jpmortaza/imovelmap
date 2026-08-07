-- ImovelMap — Fase 2 · fecha os avisos do database linter
--
-- `function_search_path_mutable`: sem search_path fixo, quem chama a funcao
-- pode plantar um schema no proprio search_path e sequestrar a resolucao
-- de nome de qualquer objeto que ela use.
--
-- Ficam de proposito os avisos `authenticated_security_definer_function_executable`:
--   get_lease_atual / marcar_trabalhado — o painel precisa chamar, e as duas
--     filtram por auth.uid() internamente (ver 0005).
--   is_super_admin / is_corretor_ativo  — usadas DENTRO das policies de RLS;
--     precisam de SECURITY DEFINER, senao a policy de `corretores` recursaria
--     sobre si mesma. Devolvem so um booleano sobre quem chamou.

alter function public.j_num(text)        set search_path = pg_catalog, pg_temp;
alter function public.j_int(text)        set search_path = pg_catalog, pg_temp;
alter function public.j_ts(text)         set search_path = pg_catalog, pg_temp;
alter function public.set_updated_at()   set search_path = pg_catalog, pg_temp;
