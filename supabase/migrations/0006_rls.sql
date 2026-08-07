-- ImovelMap — Fase 2 · RLS, grants e privilegios de coluna
--
-- Duas camadas:
--   1. RLS decide QUAIS LINHAS cada um enxerga.
--   2. GRANT de coluna decide QUAIS CAMPOS. E isso que impede o publico
--      anonimo de ler endereco/cep/numero — o ativo do produto.
--
-- Supabase concede ALL em tabelas novas para anon/authenticated por
-- default privileges. Por isso todo grant aqui comeca com REVOKE.
-- Regra do projeto: toda tabela nova precisa de RLS + grant explicito.

-- ------------------------------------------------------------------ helpers
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.corretores
    where id = auth.uid() and role = 'super_admin' and ativo
  );
$$;

create or replace function public.is_corretor_ativo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.corretores where id = auth.uid() and ativo
  );
$$;

-- ------------------------------------------------------------- zera privilegios
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ------------------------------------------------------------------ RLS on
alter table public.corretores    enable row level security;
alter table public.fontes        enable row level security;
alter table public.extracoes     enable row level security;
alter table public.imoveis       enable row level security;
alter table public.distribuicoes enable row level security;
alter table public.favoritos     enable row level security;
alter table public.alertas       enable row level security;
alter table public.notificacoes  enable row level security;
alter table public.proprietarios enable row level security;
alter table public.imovel_precos enable row level security;
alter table public.imovel_grupos enable row level security;
alter table public.fachadas      enable row level security;
alter table public.agenciamentos enable row level security;
alter table public.capturas      enable row level security;

alter table publico.iptu_poa        enable row level security;
alter table publico.logradouros_poa enable row level security;
alter table publico.alvaras_poa     enable row level security;
alter table publico.osm_predios     enable row level security;

-- ------------------------------------------------------------------ corretores
create policy corretores_select_own on public.corretores
  for select to authenticated
  using (id = auth.uid() or public.is_super_admin());

create policy corretores_update_own on public.corretores
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

grant select on public.corretores to authenticated;
-- role/ativo/cota_diaria so mudam via service role: nao entram no grant
grant update (nome, telefone, creci, cidade, estado)
  on public.corretores to authenticated;

-- ------------------------------------------------------------------ imoveis
-- publico anonimo: so anuncio ativo, e so as colunas do card/mapa.
create policy imoveis_select_anon on public.imoveis
  for select to anon
  using (is_active);

create policy imoveis_select_auth on public.imoveis
  for select to authenticated
  using (true);

-- ★ o endereco fica de fora: endereco, endereco_numero, complemento, cep,
--   inscricao_imobiliaria, valor_venal, temperatura, raw, geom, external_id.
grant select (
  id, title, transaction_type, property_type, property_sub_type,
  price, price_formatted, condominium_fee, iptu, price_per_sqm,
  area, bedrooms, bathrooms, parking_spaces,
  neighborhood, city, state, latitude, longitude,
  images, image_count, source, source_url,
  published_at, first_seen_at, last_seen_at, is_active
) on public.imoveis to anon;

grant select on public.imoveis to authenticated;
-- escrita so pela RPC upsert_imovel (service role)

-- ------------------------------------------------------------------ fontes
create policy fontes_select on public.fontes
  for select to authenticated using (public.is_corretor_ativo());
create policy fontes_write on public.fontes
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

grant select, insert, update, delete on public.fontes to authenticated;

-- ------------------------------------------------------------------ extracoes
create policy extracoes_select on public.extracoes
  for select to authenticated using (public.is_super_admin());

grant select on public.extracoes to authenticated;

-- ------------------------------------------------------------------ distribuicoes
create policy distribuicoes_select_own on public.distribuicoes
  for select to authenticated using (corretor_id = auth.uid());

grant select on public.distribuicoes to authenticated;
-- insert/update so pelas RPCs distribuir_imoveis_do_dia / marcar_trabalhado

-- ------------------------------------------------------------------ favoritos
create policy favoritos_own on public.favoritos
  for all to authenticated
  using (corretor_id = auth.uid()) with check (corretor_id = auth.uid());

grant select, insert, update, delete on public.favoritos to authenticated;

-- ------------------------------------------------------------------ alertas
create policy alertas_own on public.alertas
  for all to authenticated
  using (corretor_id = auth.uid()) with check (corretor_id = auth.uid());

grant select, insert, update, delete on public.alertas to authenticated;

-- ------------------------------------------------------------------ notificacoes
create policy notificacoes_select_own on public.notificacoes
  for select to authenticated using (corretor_id = auth.uid());
create policy notificacoes_update_own on public.notificacoes
  for update to authenticated
  using (corretor_id = auth.uid()) with check (corretor_id = auth.uid());

grant select on public.notificacoes to authenticated;
grant update (visualizada) on public.notificacoes to authenticated;

-- ------------------------------------------------------------------ proprietarios
-- dado pessoal: cada corretor so ve o que ele mesmo levantou (LGPD)
create policy proprietarios_own on public.proprietarios
  for all to authenticated
  using (corretor_id = auth.uid()) with check (corretor_id = auth.uid());

grant select, insert, update, delete on public.proprietarios to authenticated;

-- ------------------------------------------------------------------ inteligencia
create policy imovel_precos_select on public.imovel_precos
  for select to authenticated using (public.is_corretor_ativo());
create policy imovel_grupos_select on public.imovel_grupos
  for select to authenticated using (public.is_corretor_ativo());
create policy fachadas_select on public.fachadas
  for select to authenticated using (public.is_corretor_ativo());

grant select on public.imovel_precos to authenticated;
grant select on public.imovel_grupos to authenticated;
grant select on public.fachadas      to authenticated;

create policy agenciamentos_own on public.agenciamentos
  for all to authenticated
  using (corretor_id = auth.uid()) with check (corretor_id = auth.uid());

grant select, insert, update, delete on public.agenciamentos to authenticated;

create policy capturas_select_own on public.capturas
  for select to authenticated using (corretor_id = auth.uid());
create policy capturas_insert_own on public.capturas
  for insert to authenticated with check (corretor_id = auth.uid());

grant select, insert on public.capturas to authenticated;
grant usage on sequence public.capturas_id_seq to authenticated;

-- ------------------------------------------------------------------ publico
-- base de dados abertos: leitura para corretor, escrita so service role.
-- (o schema `publico` nem esta exposto no PostgREST — isto e a segunda trava)
revoke all on all tables in schema publico from anon, authenticated;
grant usage on schema publico to authenticated;

create policy iptu_poa_select on publico.iptu_poa
  for select to authenticated using (public.is_corretor_ativo());
create policy logradouros_poa_select on publico.logradouros_poa
  for select to authenticated using (public.is_corretor_ativo());
create policy alvaras_poa_select on publico.alvaras_poa
  for select to authenticated using (public.is_corretor_ativo());
create policy osm_predios_select on publico.osm_predios
  for select to authenticated using (public.is_corretor_ativo());

grant select on publico.iptu_poa        to authenticated;
grant select on publico.logradouros_poa to authenticated;
grant select on publico.alvaras_poa     to authenticated;
grant select on publico.osm_predios     to authenticated;

-- ------------------------------------------------------------------ funcoes
-- por default o Postgres da EXECUTE para PUBLIC: fechar tudo e reabrir
-- so o que o usuario logado pode chamar.
revoke all on function public.upsert_imovel(jsonb)             from public;
revoke all on function public.distribuir_imoveis_do_dia(date)  from public;
revoke all on function public.match_alertas_novos(date)        from public;
revoke all on function public.calcular_temperatura(uuid)       from public;
revoke all on function public.get_lease_atual(date)            from public;
revoke all on function public.marcar_trabalhado(uuid, text, text) from public;
revoke all on function public.is_super_admin()                 from public;
revoke all on function public.is_corretor_ativo()              from public;
revoke all on function public.j_num(text)                      from public;
revoke all on function public.j_int(text)                      from public;
revoke all on function public.j_ts(text)                       from public;
revoke all on function public.set_updated_at()                 from public;
revoke all on function public.handle_new_user()                from public;

-- service role: tudo que roda no backend
grant execute on function public.upsert_imovel(jsonb)            to service_role;
grant execute on function public.distribuir_imoveis_do_dia(date) to service_role;
grant execute on function public.match_alertas_novos(date)       to service_role;
grant execute on function public.calcular_temperatura(uuid)      to service_role;
grant execute on function public.get_lease_atual(date)           to service_role;
grant execute on function public.marcar_trabalhado(uuid, text, text) to service_role;

-- corretor logado: so as duas do painel
grant execute on function public.get_lease_atual(date)              to authenticated;
grant execute on function public.marcar_trabalhado(uuid, text, text) to authenticated;
grant execute on function public.is_super_admin()                    to authenticated;
grant execute on function public.is_corretor_ativo()                 to authenticated;
