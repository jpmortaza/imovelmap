-- Importação: estado (UF).
--
-- ⚠️ NÃO É CAMPO DE ENFEITE, É GUARDA DE CASAMENTO. "Rua Santana, 100" existe
--    em quase toda capital brasileira. Sem conferir a UF, uma base que cruza
--    estados casaria um contato de São Paulo com um imóvel de Porto Alegre —
--    e o corretor ligaria para a pessoa errada com o endereço certo.
--
--    Testado: dois contatos com o MESMO endereço, um declarando RS e outro SP.
--    Só o do RS entrou; o de SP foi bloqueado nos 18 anúncios daquele imóvel.
--
--    Quando o contato não traz UF não bloqueamos — a base pode ser toda do RS
--    e simplesmente não ter a coluna.

alter table publico.contatos_importados
  add column if not exists estado text;

-- "RS", "rs", " Rio Grande do Sul " → RS. O que não for UF válida vira NULL.
create or replace function publico.uf_normalizada(p text)
returns text language sql immutable set search_path = pg_catalog, public as $$
  with s as (
    select upper(trim(public.unaccent_simples(coalesce(p, '')))) v)
  select case
    when v in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
               'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO') then v
    when v like 'RIO GRANDE DO SUL%'   then 'RS'
    when v like 'SANTA CATARINA%'      then 'SC'
    when v like 'PARANA%'              then 'PR'
    when v like 'SAO PAULO%'           then 'SP'
    when v like 'RIO DE JANEIRO%'      then 'RJ'
    when v like 'MINAS GERAIS%'        then 'MG'
    when v like 'ESPIRITO SANTO%'      then 'ES'
    when v like 'BAHIA%'               then 'BA'
    when v like 'GOIAS%'               then 'GO'
    when v like 'DISTRITO FEDERAL%'    then 'DF'
    when v like 'MATO GROSSO DO SUL%'  then 'MS'
    when v like 'MATO GROSSO%'         then 'MT'
    when v like 'RIO GRANDE DO NORTE%' then 'RN'
    when v like 'PERNAMBUCO%'          then 'PE'
    when v like 'CEARA%'               then 'CE'
    when v like 'PARA%'                then 'PA'
    when v like 'PARAIBA%'             then 'PB'
    when v like 'AMAZONAS%'            then 'AM'
    when v like 'MARANHAO%'            then 'MA'
    when v like 'PIAUI%'               then 'PI'
    when v like 'ALAGOAS%'             then 'AL'
    when v like 'SERGIPE%'             then 'SE'
    when v like 'RONDONIA%'            then 'RO'
    when v like 'TOCANTINS%'           then 'TO'
    when v like 'ACRE%'                then 'AC'
    when v like 'AMAPA%'               then 'AP'
    when v like 'RORAIMA%'             then 'RR'
    else null end
  from s;
$$;

create or replace function public.carregar_contatos(p_importacao uuid, p_itens jsonb)
returns integer language plpgsql security definer
set search_path = public, publico, pg_temp as $$
declare v_n integer;
begin
  insert into publico.contatos_importados
    (importacao_id, nome, telefone, email, documento, nascimento,
     logradouro, rua_nucleo, numero, complemento, unidade, bairro, cep,
     cidade, estado, observacao, extra)
  select p_importacao,
         nullif(trim(x.nome),''),
         -- DDD só é prefixado quando o número ainda não o tem; ver 0038
         (select case
            when f = '' then null
            when d = '' then f
            when length(f) >= 12 then f
            when left(f, length(d)) = d and length(f) >= 10 then f
            else d || f end
          from (select regexp_replace(coalesce(x.telefone,''), '\D','','g') f,
                       regexp_replace(coalesce(x.ddd,''),      '\D','','g') d) t),
         nullif(lower(trim(x.email)),''),
         (select case when length(v) in (11,14) then v else null end
            from (select regexp_replace(coalesce(x.documento,''), '\D','','g') v) u),
         publico.data_flexivel(x.nascimento),
         nullif(trim(x.logradouro),''),
         publico.nucleo_rua(x.logradouro),
         nullif(regexp_replace(coalesce(x.numero,''), '\D', '', 'g'), ''),
         nullif(trim(x.complemento),''),
         publico.unidade_do_complemento(x.complemento),
         nullif(trim(x.bairro),''),
         nullif(regexp_replace(coalesce(x.cep,''), '\D', '', 'g'), ''),
         nullif(trim(x.cidade),''),
         publico.uf_normalizada(x.estado),
         nullif(trim(x.observacao),''),
         x.extra
    from jsonb_to_recordset(p_itens) as x(
      nome text, telefone text, ddd text, email text, documento text,
      nascimento text, logradouro text, numero text, complemento text,
      bairro text, cep text, cidade text, estado text, observacao text, extra jsonb)
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
  -- nível 1: rua + número + apartamento (é o morador daquela unidade)
  with c as (
    select ci.*, i.id imovel_id
      from publico.contatos_importados ci
      join public.imoveis i
        on publico.nucleo_rua(i.endereco) = ci.rua_nucleo
       and regexp_replace(coalesce(i.endereco_numero,''), '\D','','g') = ci.numero
       and nullif(regexp_replace(coalesce(i.unidade,''), '\D','','g'),'') = ci.unidade
       and (ci.estado is null or i.state is null
            or publico.uf_normalizada(i.state) = ci.estado)
     where ci.rua_nucleo is not null and ci.numero is not null and ci.unidade is not null
       and (p_importacao is null or ci.importacao_id = p_importacao)
     limit p_lote),
  agg as (
    select imovel_id, jsonb_agg(jsonb_build_object(
             'nome', nome, 'fone', telefone, 'email', email, 'unidade', unidade,
             'doc', documento, 'nascimento', nascimento,
             'obs', observacao, 'forca', 'unidade', 'importacao', importacao_id) order by nome) j
      from c group by imovel_id)
  update public.imoveis i
     set contatos_importados = coalesce(i.contatos_importados, '[]'::jsonb) || agg.j,
         updated_at = now()
    from agg where i.id = agg.imovel_id;
  get diagnostics v_unid = row_count;

  -- nível 2: rua + número (está no endereço, não necessariamente na unidade)
  with c as (
    select ci.*, i.id imovel_id
      from publico.contatos_importados ci
      join public.imoveis i
        on publico.nucleo_rua(i.endereco) = ci.rua_nucleo
       and regexp_replace(coalesce(i.endereco_numero,''), '\D','','g') = ci.numero
       and (ci.estado is null or i.state is null
            or publico.uf_normalizada(i.state) = ci.estado)
     where ci.rua_nucleo is not null and ci.numero is not null and ci.unidade is null
       and (p_importacao is null or ci.importacao_id = p_importacao)
     limit p_lote),
  agg as (
    select imovel_id, jsonb_agg(jsonb_build_object(
             'nome', nome, 'fone', telefone, 'email', email,
             'doc', documento, 'nascimento', nascimento,
             'obs', observacao, 'forca', 'predio',
             'importacao', importacao_id) order by nome) j
      from c group by imovel_id)
  update public.imoveis i
     set contatos_importados = coalesce(i.contatos_importados, '[]'::jsonb) || agg.j,
         updated_at = now()
    from agg where i.id = agg.imovel_id;
  get diagnostics v_pred = row_count;

  return jsonb_build_object('naUnidade', v_unid, 'noPredio', v_pred);
end; $$;

revoke all on function publico.uf_normalizada(text)                    from public, anon, authenticated;
revoke all on function public.carregar_contatos(uuid, jsonb)           from public, anon, authenticated;
revoke all on function public.casar_contatos_importados(uuid, integer) from public, anon, authenticated;
grant execute on function public.carregar_contatos(uuid, jsonb)           to service_role;
grant execute on function public.casar_contatos_importados(uuid, integer) to service_role;
