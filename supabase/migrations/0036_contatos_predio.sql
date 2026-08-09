-- Contatos do PRÉDIO: quem mais está no mesmo endereço.
--
-- `contatos_cnpj` (0033) exige a unidade exata — preciso, mas estreito: 773
-- imóveis. Casar por rua+número dá 30.067, com média de 4,5 cadastros por
-- prédio. É mais fraco, e a UI diz isso: serve para chegar ao prédio, não
-- para ligar afirmando que se fala com o dono.
--
-- ⭐ O ACHADO: o CONDOMÍNIO tem CNPJ próprio, registrado no endereço do
--    prédio. 19.316 imóveis têm o do seu. Quem atende ali é a administração —
--    e a administração sabe de quem é o 802. Era a porta que faltava para
--    chegar ao proprietário sem passar pelo cartório, e ela estava dentro de
--    um cadastro que já tínhamos.
--
--    Por isso o condomínio entra MESMO em prédio grande, enquanto morador só
--    entra até 15 empresas no endereço: acima disso é torre comercial ou
--    endereço de contabilidade e a lista deixa de significar alguma coisa.
--
-- ⚠️ Vale o mesmo aviso da 0033, e com mais força: isto não diz quem é o
--    dono. Diz quem está cadastrado naquele endereço. Quem confirma é a
--    matrícula.

alter table public.imoveis add column if not exists contatos_predio jsonb;
grant select (contatos_predio) on public.imoveis to authenticated;

create or replace function public.casar_cnpj_predio(p_lote integer default 5000)
returns integer language plpgsql security definer
set search_path = public, publico, pg_temp as $$
declare v_n integer;
begin
  with alvo as (
    select i.id, publico.nucleo_rua(i.endereco) nucleo,
           regexp_replace(i.endereco_numero, '\D','','g') num
      from public.imoveis i
     where i.city ilike '%porto alegre%'
       and i.endereco is not null and i.endereco_numero is not null
       and i.contatos_predio is null
     limit p_lote),
  denso as (
    select a.id, count(*) filter (where c.tipo_unidade in ('apto','casa')) n
      from alvo a
      join publico.cnpj_estabelecimentos c
        on c.rua_nucleo = a.nucleo and c.numero = a.num
     where c.ativa
     group by a.id),
  achado as (
    select a.id,
           jsonb_agg(jsonb_build_object(
             'nome', case when c.natureza in ('2135','2313')
                          then publico.nome_pessoa(c.razao_social)
                          else c.razao_social end,
             'fone', c.fone,
             'local', c.fone like '51%',
             'unidade', c.unidade,
             'pessoaFisica', c.natureza in ('2135','2313'),
             'condominio', c.razao_social ~* '^\s*CONDOMINIO\y'
           ) order by (c.razao_social ~* '^\s*CONDOMINIO\y') desc,
                      (c.fone like '51%') desc,
                      (c.natureza in ('2135','2313')) desc, c.unidade) contatos
      from alvo a
      join denso d on d.id = a.id
      join publico.cnpj_estabelecimentos c
        on c.rua_nucleo = a.nucleo and c.numero = a.num
     where c.ativa and c.razao_social is not null
       and (c.razao_social ~* '^\s*CONDOMINIO\y'
            or (c.tipo_unidade in ('apto','casa') and d.n <= 15))
     group by a.id)
  update public.imoveis i
     set contatos_predio = achado.contatos, updated_at = now()
    from achado where i.id = achado.id;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

-- entra no tick: conforme o ITBI descobre novos números, o prédio entra junto
create or replace function public.enriquecer_tick()
returns jsonb language plpgsql security definer
set search_path = public, publico, pg_temp as $$
declare v_nome integer; v_sobre integer; v_cnpj integer; v_pred integer;
begin
  v_nome  := public.nomear_condominios(5000);
  v_sobre := public.calcular_sobrepreco(5000);
  v_cnpj  := public.casar_cnpj_lote(3000);
  v_pred  := public.casar_cnpj_predio(3000);
  return jsonb_build_object('nomeados', v_nome, 'sobrepreco', v_sobre,
                            'cnpj', v_cnpj, 'predio', v_pred);
end; $$;

revoke all on function public.casar_cnpj_predio(integer) from public, anon, authenticated;
revoke all on function public.enriquecer_tick()          from public, anon, authenticated;
grant execute on function public.casar_cnpj_predio(integer) to service_role;
