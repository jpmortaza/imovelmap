-- ImovelMap — ITBI de Porto Alegre (2020-2026, 354.728 transacoes)
--
-- ⭐ A MELHOR FONTE DO PROJETO. O ITBI e o imposto de transmissao, e Porto
--    Alegre publica o cadastro completo em dados abertos, com:
--
--      n_matricula_reg_imoveis + n_zona_reg_imoveis
--        → O NUMERO DA MATRICULA E O CARTORIO. Presente em 99,97% das linhas.
--          O corretor deixa de pagar busca as cegas: vai direto na zona certa
--          com o numero exato e tira a certidao, que nomeia o proprietario.
--      logradouro + n_endereco + n_unidade + cep (CEP em 100%)
--        → o endereco COM apartamento — o que a Rede Gaucha esconde
--      area_constr_privativa
--        → area PRIVATIVA, que e a que o anuncio publica. O IPTU so da a
--          construida total (inclui parede e area comum) e por isso casava mal.
--      base_de_calculo + data_estimativa
--        → quanto e quando foi a ultima venda. Dono que comprou ha 8 anos e
--          alvo melhor do que quem comprou ano passado.
--      ano_construcao
--
-- Nao ha nome de pessoa aqui, e nao precisa haver: a matricula e o ponteiro, e
-- a certidao do registro de imoveis e publica por lei.
--
-- Como carregar: CKAN datastore_search paginado, 10 mil por vez, 7 recursos
-- (um por ano). ~6 min para os 354 mil. Nada de baixar CSV nem de psql.

create table if not exists publico.itbi (
  id                bigserial primary key,
  ano_base          smallint not null,
  data_estimativa   date,
  data_pagamento    date,
  base_de_calculo   numeric,
  perc_transmitido  numeric,
  finalidade        text,
  logradouro        text,
  rua_nucleo        text,
  n_endereco        text,
  n_unidade         text,
  complemento       text,
  bairro            text,
  cep               text,
  area_terreno      numeric,
  area_total        numeric,
  area_privativa    numeric,
  ano_construcao    smallint,
  matricula         text,
  zona_registro     text,
  situacao          text
);

create index if not exists itbi_nucleo_idx on publico.itbi using gin (rua_nucleo gin_trgm_ops);
create index if not exists itbi_end_idx    on publico.itbi (rua_nucleo, n_endereco);
create index if not exists itbi_cep_idx    on publico.itbi (cep) where cep is not null;
create index if not exists itbi_priv_idx   on publico.itbi (area_privativa) where area_privativa > 0;

alter table publico.itbi enable row level security;
revoke all on publico.itbi from anon, authenticated;
revoke all on sequence publico.itbi_id_seq from anon, authenticated;

create or replace function public.carregar_itbi(p_itens jsonb, p_ano smallint)
returns integer language plpgsql security definer
set search_path = public, publico, pg_temp as $$
declare v_n integer;
begin
  insert into publico.itbi (ano_base, data_estimativa, data_pagamento, base_de_calculo,
    perc_transmitido, finalidade, logradouro, rua_nucleo, n_endereco, n_unidade,
    complemento, bairro, cep, area_terreno, area_total, area_privativa,
    ano_construcao, matricula, zona_registro, situacao)
  select p_ano,
         nullif(x.data_estimativa,'')::date, nullif(x.data_pagamento,'')::date,
         nullif(x.base_de_calculo,'')::numeric, nullif(x.perc_transmitido,'')::numeric,
         nullif(x.finalidade_construcao,''), x.logradouro, publico.nucleo_rua(x.logradouro),
         nullif(regexp_replace(coalesce(x.n_endereco,''), '\D', '', 'g'), ''),
         nullif(trim(coalesce(x.n_unidade,'')), ''),
         nullif(trim(coalesce(x.complemento_endereco,'')), ''),
         nullif(x.bairro,''),
         nullif(regexp_replace(coalesce(x.cep,''), '\D', '', 'g'), ''),
         nullif(x.area_total_terreno,'')::numeric, nullif(x.area_constr_total,'')::numeric,
         nullif(x.area_constr_privativa,'')::numeric,
         nullif(regexp_replace(coalesce(x.ano_construcao,''), '\D', '', 'g'), '')::smallint,
         nullif(regexp_replace(coalesce(x.n_matricula_reg_imoveis,''), '\D', '', 'g'), ''),
         nullif(trim(coalesce(x.n_zona_reg_imoveis,'')), ''),
         nullif(x.situacao,'')
    from jsonb_to_recordset(p_itens) as x(
      data_estimativa text, data_pagamento text, base_de_calculo text,
      perc_transmitido text, finalidade_construcao text, logradouro text,
      n_endereco text, n_unidade text, complemento_endereco text, bairro text,
      cep text, area_total_terreno text, area_constr_total text,
      area_constr_privativa text, ano_construcao text,
      n_matricula_reg_imoveis text, n_zona_reg_imoveis text, situacao text)
   where publico.nucleo_rua(x.logradouro) is not null;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

revoke all on function public.carregar_itbi(jsonb, smallint) from public, anon, authenticated;
grant execute on function public.carregar_itbi(jsonb, smallint) to service_role;
