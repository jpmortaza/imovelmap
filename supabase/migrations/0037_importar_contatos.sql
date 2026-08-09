-- Importar base própria de contatos e ligar aos imóveis pelo endereço.
--
-- O Jean pediu isto para quando tiver dado amparado pela LGPD: ele sobe a
-- planilha em `/admin/importar`, mapeia as colunas e o sistema cruza por
-- endereço.
--
-- ⭐ CADA LOTE DECLARA ORIGEM E BASE LEGAL, e isso não é burocracia — é o que
--    faz a coisa funcionar:
--      · dá para auditar de onde veio um contato meses depois
--      · dá para APAGAR uma base inteira num comando, inclusive de dentro do
--        jsonb de cada imóvel, quando um titular pedir exclusão ou a origem
--        se revelar ruim
--    Sem o registro de procedência, contato importado vira dado órfão e não
--    há como desfazer. `apagar_importacao` é o que atende o direito de
--    eliminação do titular (LGPD art. 18, VI) — foi testado: 3 contatos
--    ligados a 5 anúncios sumiram da tabela E de dentro dos imóveis.
--
-- Três forças de casamento, gravadas em cada contato para a tela distinguir:
--   'unidade' — rua + número + apartamento: é o morador daquela unidade
--   'predio'  — rua + número: está no endereço, não na unidade
--   (o CEP entra como rede de segurança quando a grafia da rua diverge)

create table if not exists publico.importacoes (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  origem       text not null,
  base_legal   text not null,
  observacao   text,
  criado_por   uuid references public.corretores(id),
  criado_em    timestamptz not null default now(),
  linhas       integer not null default 0
);

create table if not exists publico.contatos_importados (
  id            bigserial primary key,
  importacao_id uuid not null references publico.importacoes(id) on delete cascade,
  nome          text,
  telefone      text,
  email         text,
  logradouro    text,
  rua_nucleo    text,
  numero        text,
  complemento   text,
  unidade       text,
  bairro        text,
  cep           text,
  cidade        text,
  observacao    text,
  extra         jsonb
);

create index if not exists ci_end_idx  on publico.contatos_importados (rua_nucleo, numero);
create index if not exists ci_unid_idx on publico.contatos_importados (rua_nucleo, numero, unidade);
create index if not exists ci_cep_idx  on publico.contatos_importados (cep) where cep is not null;
create index if not exists ci_imp_idx  on publico.contatos_importados (importacao_id);

alter table publico.importacoes         enable row level security;
alter table publico.contatos_importados enable row level security;
revoke all on publico.importacoes         from anon, authenticated;
revoke all on publico.contatos_importados from anon, authenticated;
revoke all on sequence publico.contatos_importados_id_seq from anon, authenticated;

alter table public.imoveis add column if not exists contatos_importados jsonb;
grant select (contatos_importados) on public.imoveis to authenticated;

create or replace function public.criar_importacao(
  p_nome text, p_origem text, p_base_legal text, p_observacao text default null)
returns uuid language plpgsql security definer
set search_path = public, publico, pg_temp as $$
declare v_id uuid;
begin
  -- origem e base legal são obrigatórias: sem elas não há como auditar nem apagar
  if coalesce(trim(p_nome),'') = '' or coalesce(trim(p_origem),'') = ''
     or coalesce(trim(p_base_legal),'') = '' then
    raise exception 'nome, origem e base legal sao obrigatorios';
  end if;
  insert into publico.importacoes (nome, origem, base_legal, observacao, criado_por)
  values (trim(p_nome), trim(p_origem), trim(p_base_legal),
          nullif(trim(p_observacao),''), auth.uid())
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.carregar_contatos(p_importacao uuid, p_itens jsonb)
returns integer language plpgsql security definer
set search_path = public, publico, pg_temp as $$
declare v_n integer;
begin
  insert into publico.contatos_importados
    (importacao_id, nome, telefone, email, logradouro, rua_nucleo, numero,
     complemento, unidade, bairro, cep, cidade, observacao, extra)
  select p_importacao, nullif(trim(x.nome),''),
         nullif(regexp_replace(coalesce(x.telefone,''), '\D', '', 'g'), ''),
         nullif(lower(trim(x.email)),''),
         nullif(trim(x.logradouro),''),
         publico.nucleo_rua(x.logradouro),
         nullif(regexp_replace(coalesce(x.numero,''), '\D', '', 'g'), ''),
         nullif(trim(x.complemento),''),
         publico.unidade_do_complemento(x.complemento),
         nullif(trim(x.bairro),''),
         nullif(regexp_replace(coalesce(x.cep,''), '\D', '', 'g'), ''),
         nullif(trim(x.cidade),''),
         nullif(trim(x.observacao),''),
         x.extra
    from jsonb_to_recordset(p_itens) as x(
      nome text, telefone text, email text, logradouro text, numero text,
      complemento text, bairro text, cep text, cidade text, observacao text,
      extra jsonb)
   where coalesce(x.logradouro, x.cep, x.telefone, x.email) is not null;
  get diagnostics v_n = row_count;
  update publico.importacoes set linhas = linhas + v_n where id = p_importacao;
  return v_n;
end; $$;

create or replace function public.casar_contatos_importados(
  p_importacao uuid default null, p_lote integer default 20000)
returns jsonb language plpgsql security definer
set search_path = public, publico, extensions, pg_temp as $$
declare v_unid integer := 0; v_pred integer := 0;
begin
  with c as (
    select ci.*, i.id imovel_id
      from publico.contatos_importados ci
      join public.imoveis i
        on publico.nucleo_rua(i.endereco) = ci.rua_nucleo
       and regexp_replace(coalesce(i.endereco_numero,''), '\D','','g') = ci.numero
       and nullif(regexp_replace(coalesce(i.unidade,''), '\D','','g'),'') = ci.unidade
     where ci.rua_nucleo is not null and ci.numero is not null and ci.unidade is not null
       and (p_importacao is null or ci.importacao_id = p_importacao)
     limit p_lote),
  agg as (
    select imovel_id, jsonb_agg(jsonb_build_object(
             'nome', nome, 'fone', telefone, 'email', email, 'unidade', unidade,
             'obs', observacao, 'forca', 'unidade', 'importacao', importacao_id) order by nome) j
      from c group by imovel_id)
  update public.imoveis i
     set contatos_importados = coalesce(i.contatos_importados, '[]'::jsonb) || agg.j,
         updated_at = now()
    from agg where i.id = agg.imovel_id;
  get diagnostics v_unid = row_count;

  with c as (
    select ci.*, i.id imovel_id
      from publico.contatos_importados ci
      join public.imoveis i
        on publico.nucleo_rua(i.endereco) = ci.rua_nucleo
       and regexp_replace(coalesce(i.endereco_numero,''), '\D','','g') = ci.numero
     where ci.rua_nucleo is not null and ci.numero is not null and ci.unidade is null
       and (p_importacao is null or ci.importacao_id = p_importacao)
     limit p_lote),
  agg as (
    select imovel_id, jsonb_agg(jsonb_build_object(
             'nome', nome, 'fone', telefone, 'email', email, 'obs', observacao,
             'forca', 'predio', 'importacao', importacao_id) order by nome) j
      from c group by imovel_id)
  update public.imoveis i
     set contatos_importados = coalesce(i.contatos_importados, '[]'::jsonb) || agg.j,
         updated_at = now()
    from agg where i.id = agg.imovel_id;
  get diagnostics v_pred = row_count;

  return jsonb_build_object('naUnidade', v_unid, 'noPredio', v_pred);
end; $$;

-- Direito de eliminação: apaga a base E limpa os contatos dela de dentro de
-- cada imóvel. Sem a segunda parte o dado ficaria órfão no jsonb.
create or replace function public.apagar_importacao(p_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, publico, pg_temp as $$
declare v_imoveis integer; v_linhas integer;
begin
  update public.imoveis
     set contatos_importados = nullif((
           select jsonb_agg(x) from jsonb_array_elements(contatos_importados) x
            where x ->> 'importacao' is distinct from p_id::text), '[]'::jsonb)
   where contatos_importados @> jsonb_build_array(jsonb_build_object('importacao', p_id));
  get diagnostics v_imoveis = row_count;

  select count(*) into v_linhas from publico.contatos_importados where importacao_id = p_id;
  delete from publico.importacoes where id = p_id;
  return jsonb_build_object('imoveisLimpos', v_imoveis, 'linhasApagadas', v_linhas);
end; $$;

revoke all on function public.criar_importacao(text, text, text, text)     from public, anon, authenticated;
revoke all on function public.carregar_contatos(uuid, jsonb)               from public, anon, authenticated;
revoke all on function public.casar_contatos_importados(uuid, integer)     from public, anon, authenticated;
revoke all on function public.apagar_importacao(uuid)                      from public, anon, authenticated;
grant execute on function public.criar_importacao(text, text, text, text)  to service_role;
grant execute on function public.carregar_contatos(uuid, jsonb)            to service_role;
grant execute on function public.casar_contatos_importados(uuid, integer)  to service_role;
grant execute on function public.apagar_importacao(uuid)                   to service_role;
