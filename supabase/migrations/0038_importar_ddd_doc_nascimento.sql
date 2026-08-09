-- Importação: DDD em coluna separada, CPF/CNPJ e nascimento.
--
-- ⚠️ O DDD É O DETALHE QUE FAZ O TELEFONE DISCAR. Exportação brasileira quase
--    sempre separa DDD do número, e sem juntar os dois o contato é inútil. Mas
--    juntar cegamente também quebra: a MESMA planilha costuma ter linhas com o
--    DDD já dentro do número e linhas sem — concatenar sempre produziria
--    "5151999...". A regra só prefixa quando o número ainda não começa com o
--    DDD e tem menos de 12 dígitos (12+ já traz DDI).
--
-- Documento: 11 dígitos é CPF, 14 é CNPJ; qualquer outro tamanho é coluna
-- errada e vira NULL em vez de sujeira. Na página do imóvel ele sai MASCARADO
-- ("123.***.**9-09") — o corretor não precisa do CPF inteiro para ligar.

alter table publico.contatos_importados
  add column if not exists documento  text,
  add column if not exists nascimento date;

create index if not exists ci_doc_idx on publico.contatos_importados (documento)
  where documento is not null;

-- Data brasileira vem de todo jeito: 31/12/1980, 1980-12-31, 31121980,
-- 19801231, às vezes com hora colada. Formato inesperado ou data impossível
-- (31/02) devolve NULL em vez de estourar e perder o lote inteiro.
create or replace function publico.data_flexivel(p text)
returns date language plpgsql immutable
set search_path = pg_catalog as $$
declare s text; d date;
begin
  s := trim(coalesce(p, ''));
  if s = '' then return null; end if;
  s := split_part(split_part(s, ' ', 1), 'T', 1);
  begin
    if s ~ '^\d{2}[/-]\d{2}[/-]\d{4}$' then
      d := to_date(regexp_replace(s, '[/-]', '', 'g'), 'DDMMYYYY');
    elsif s ~ '^\d{4}[/-]\d{2}[/-]\d{2}$' then
      d := to_date(regexp_replace(s, '[/-]', '', 'g'), 'YYYYMMDD');
    elsif s ~ '^\d{8}$' then
      d := case when left(s,2) in ('19','20')
                then to_date(s, 'YYYYMMDD') else to_date(s, 'DDMMYYYY') end;
    else
      return null;
    end if;
  exception when others then
    return null;
  end;
  if d < date '1900-01-01' or d > current_date then return null; end if;
  return d;
end; $$;

create or replace function public.carregar_contatos(p_importacao uuid, p_itens jsonb)
returns integer language plpgsql security definer
set search_path = public, publico, pg_temp as $$
declare v_n integer;
begin
  insert into publico.contatos_importados
    (importacao_id, nome, telefone, email, documento, nascimento,
     logradouro, rua_nucleo, numero, complemento, unidade, bairro, cep, cidade,
     observacao, extra)
  select p_importacao,
         nullif(trim(x.nome),''),
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
         nullif(trim(x.observacao),''),
         x.extra
    from jsonb_to_recordset(p_itens) as x(
      nome text, telefone text, ddd text, email text, documento text,
      nascimento text, logradouro text, numero text, complemento text,
      bairro text, cep text, cidade text, observacao text, extra jsonb)
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
             'doc', documento, 'nascimento', nascimento,
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

revoke all on function publico.data_flexivel(text)                     from public, anon, authenticated;
revoke all on function public.carregar_contatos(uuid, jsonb)           from public, anon, authenticated;
revoke all on function public.casar_contatos_importados(uuid, integer) from public, anon, authenticated;
grant execute on function public.carregar_contatos(uuid, jsonb)           to service_role;
grant execute on function public.casar_contatos_importados(uuid, integer) to service_role;
