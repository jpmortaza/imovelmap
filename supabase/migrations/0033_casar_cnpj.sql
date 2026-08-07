-- Casar anúncio com a empresa registrada NA MESMA UNIDADE.
--
-- ⚠️ TRÊS FILTROS APRENDIDOS OLHANDO O RESULTADO ERRADO:
--
-- 1) Tipo de unidade tem que bater. "Unidade 408" do anúncio casando com
--    "SALA 408" é erro de tipo: são coisas diferentes no mesmo prédio.
--    Aceitamos só `apto` e `casa` — é onde mora gente, e onde o morador
--    tende a ser o dono.
--
-- 2) No máximo 3 CNPJ na mesma unidade. A "SALA 408" da Av. Cristóvão
--    Colombo 2144 tinha SETE empresas com DDD de SP, RJ e PE: é endereço
--    virtual de contabilidade, não morador. Medido: 86.822 unidades têm uma
--    empresa só, 11.591 têm 2-3, e apenas 904 têm 4+ — essas 904 concentram
--    11.735 empresas e são justamente o lixo.
--
-- 3) Só empresa ATIVA. Baixada há dez anos não diz quem mora hoje.
--
-- Resultado: 770 imóveis com nome e telefone da unidade exata — e todos os
-- 770 já têm matrícula, então o lead vem completo (endereço, apartamento,
-- nome, telefone, e a matrícula para confirmar quem é o dono de fato).
--
-- ⚠️ E O MAIS IMPORTANTE: isso NÃO prova propriedade. A UI diz "empresa
--    registrada nesta unidade", jamais "proprietário", e repete o aviso.

alter table public.imoveis add column if not exists contatos_cnpj jsonb;
grant select (contatos_cnpj) on public.imoveis to authenticated;

-- A densidade por unidade não muda entre lotes: calcular dentro da função
-- fazia varrer 856 mil linhas por chamada e estourava o statement timeout.
create materialized view if not exists publico.cnpj_densidade as
select rua_nucleo, numero, unidade, count(*) n
  from publico.cnpj_estabelecimentos
 where ativa and unidade is not null and tipo_unidade in ('apto','casa')
 group by 1,2,3;

create unique index if not exists cnpj_dens_idx
  on publico.cnpj_densidade (rua_nucleo, numero, unidade);
revoke all on publico.cnpj_densidade from anon, authenticated;

create or replace function public.casar_cnpj_lote(p_lote integer default 3000)
returns integer language plpgsql security definer
set search_path = public, publico, pg_temp as $$
declare v_n integer;
begin
  with alvo as (
    select i.id, publico.nucleo_rua(i.endereco) nucleo,
           regexp_replace(i.endereco_numero, '\D','','g') num,
           nullif(regexp_replace(i.unidade, '\D','','g'), '') unid
      from public.imoveis i
     where i.city ilike '%porto alegre%'
       and i.endereco is not null and i.endereco_numero is not null
       and i.unidade is not null and i.contatos_cnpj is null
     limit p_lote),
  achado as (
    select a.id,
           jsonb_agg(jsonb_build_object(
             'nome', case when c.natureza in ('2135','2313')
                          then publico.nome_pessoa(c.razao_social)
                          else c.razao_social end,
             'fone', c.fone,
             'local', c.fone like '51%',
             'complemento', c.complemento,
             'pessoaFisica', c.natureza in ('2135','2313')
           ) order by (c.natureza in ('2135','2313')) desc,
                      (c.fone like '51%') desc, c.razao_social) contatos
      from alvo a
      join publico.cnpj_estabelecimentos c
        on c.rua_nucleo = a.nucleo and c.numero = a.num and c.unidade = a.unid
      join publico.cnpj_densidade d
        on d.rua_nucleo = c.rua_nucleo and d.numero = c.numero and d.unidade = c.unidade
     where a.unid is not null and c.ativa
       and c.tipo_unidade in ('apto','casa')
       and c.razao_social is not null and d.n <= 3
     group by a.id)
  update public.imoveis i
     set contatos_cnpj = achado.contatos, updated_at = now()
    from achado where i.id = achado.id;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

revoke all on function public.casar_cnpj_lote(integer) from public, anon, authenticated;
grant execute on function public.casar_cnpj_lote(integer) to service_role;

-- entra no tick de enriquecimento: conforme o ITBI descobre novas unidades,
-- o CNPJ daquelas unidades entra junto
create or replace function public.enriquecer_tick()
returns jsonb language plpgsql security definer
set search_path = public, publico, pg_temp as $$
declare v_nome integer; v_sobre integer; v_cnpj integer;
begin
  v_nome  := public.nomear_condominios(5000);
  v_sobre := public.calcular_sobrepreco(5000);
  v_cnpj  := public.casar_cnpj_lote(3000);
  return jsonb_build_object('nomeados', v_nome, 'sobrepreco', v_sobre, 'cnpj', v_cnpj);
end; $$;

create or replace function public.refresh_itbi_referencia()
returns void language plpgsql security definer
set search_path = publico, pg_temp as $$
begin
  refresh materialized view concurrently publico.itbi_referencia;
  refresh materialized view concurrently publico.cnpj_densidade;
end; $$;

revoke all on function public.enriquecer_tick()         from public, anon, authenticated;
revoke all on function public.refresh_itbi_referencia() from public, anon, authenticated;
