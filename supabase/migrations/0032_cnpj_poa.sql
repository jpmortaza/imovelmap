-- Estabelecimentos com CNPJ em Porto Alegre — 856.167, do dump da Receita.
--
-- ⭐ Por que isso encontra dono de imóvel: milhões de brasileiros abrem
--    empresa no endereço onde MORAM. O cadastro traz logradouro, número,
--    COMPLEMENTO (vem "APT 612" com frequência) e TELEFONE. E para
--    EMPRESÁRIO INDIVIDUAL / MEI a razão social É O NOME DA PESSOA.
--
--    Resultado real: "Rua Landel de Moura, 1552 · ap 103 → Izaura Moraes
--    Ramires, (51) 9469-5864" — nome e celular de quem está no apartamento,
--    sem cartório e sem custo.
--
-- Números: 856.167 estabelecimentos, 288.142 ativos, 324.772 com número de
-- apartamento no complemento, 614.030 com telefone.
--
-- ⚠️ ISSO NÃO PROVA PROPRIEDADE. Diz que há uma empresa registrada naquele
--    endereço. A pessoa pode ser inquilina ou já ter mudado. Quem confirma
--    titularidade é a matrícula. A UI diz "empresa registrada nesta unidade",
--    nunca "proprietário" — e repete o aviso embaixo da lista.
--
-- Como foi carregado, sem baixar 5 GB para disco: cada zip da Receita tem um
-- único membro, então dá para descomprimir em fluxo (zlib raw, -15) e
-- descartar tudo que não é município 8801. Estabelecimentos0.zip tem 2 GB e
-- os outros nove ~320 MB cada — a Receita não divide igual.
--
-- ⚠️ O dump tem bytes NUL no meio de campos de texto (sobra de padding de
--    registro fixo). Decodificados em latin-1 o jsonb do Postgres recusa:
--    "unsupported Unicode escape sequence". Limpar os controles antes de enviar.

create table if not exists publico.cnpj_estabelecimentos (
  cnpj         text primary key,
  basico       text not null,
  razao_social text,
  fantasia     text,
  natureza     text,
  ativa        boolean,
  cnae         text,
  tipo_log     text,
  logradouro   text,
  rua_nucleo   text,
  numero       text,
  complemento  text,
  unidade      text,          -- número do apto extraído do complemento
  tipo_unidade text,          -- apto | casa | sala | loja
  bairro       text,
  cep          text,
  fone         text
);

create index if not exists cnpj_end_idx    on publico.cnpj_estabelecimentos (rua_nucleo, numero);
create index if not exists cnpj_tipo_idx   on publico.cnpj_estabelecimentos (rua_nucleo, numero, unidade, tipo_unidade);
create index if not exists cnpj_cep_idx    on publico.cnpj_estabelecimentos (cep);
create index if not exists cnpj_basico_idx on publico.cnpj_estabelecimentos (basico);

alter table publico.cnpj_estabelecimentos enable row level security;
revoke all on publico.cnpj_estabelecimentos from anon, authenticated;

-- "APT 612", "APTO 1204", "AP 51", "CASA 2", "SALA 302", "CONJ 802"
create or replace function publico.unidade_do_complemento(p text)
returns text language sql immutable set search_path = pg_catalog as $$
  select nullif((regexp_match(
    upper(coalesce(p, '')),
    '\y(?:APTO?|AP|APARTAMENTO|CASA|SALA|CONJ(?:UNTO)?|LOJA|BLOCO)\s*[.:\-]?\s*(\d{1,5})\y'
  ))[1], '');
$$;

-- Razão social de MEI vem com o documento colado no nome:
--   "50.262.071 IZAURA MORAES RAMIRES"  ou  "ALYNE AZEVEDO SILVA 95382062072"
-- Guardamos só o nome; o documento não interessa e não deve circular na tela.
create or replace function publico.nome_pessoa(p_razao text)
returns text language sql immutable set search_path = pg_catalog as $$
  select nullif(trim(regexp_replace(
           regexp_replace(coalesce(p_razao,''), '^[\d.\-/]+\s+', ''),
           '\s+\d{6,14}$', '')), '');
$$;

create or replace function public.carregar_cnpj(p_itens jsonb)
returns integer language plpgsql security definer
set search_path = public, publico, pg_temp as $$
declare v_n integer;
begin
  insert into publico.cnpj_estabelecimentos
    (cnpj, basico, razao_social, fantasia, natureza, ativa, cnae,
     tipo_log, logradouro, rua_nucleo, numero, complemento, unidade, bairro, cep, fone)
  select x.cnpj, x.basico, x.razao_social, x.fantasia, x.natureza, x.ativa, x.cnae,
         x.tipo_log, x.logradouro,
         publico.nucleo_rua(coalesce(x.tipo_log,'') || ' ' || coalesce(x.logradouro,'')),
         nullif(regexp_replace(coalesce(x.numero,''), '\D', '', 'g'), ''),
         x.complemento,
         publico.unidade_do_complemento(x.complemento),
         x.bairro,
         nullif(regexp_replace(coalesce(x.cep,''), '\D', '', 'g'), ''),
         nullif(trim(coalesce(x.ddd,'') || coalesce(x.fone,'')), '')
    from jsonb_to_recordset(p_itens) as x(
      cnpj text, basico text, razao_social text, fantasia text, natureza text,
      ativa boolean, cnae text, tipo_log text, logradouro text, numero text,
      complemento text, bairro text, cep text, ddd text, fone text)
   where x.cnpj is not null
  on conflict (cnpj) do update set
    razao_social = coalesce(excluded.razao_social, publico.cnpj_estabelecimentos.razao_social),
    natureza     = coalesce(excluded.natureza, publico.cnpj_estabelecimentos.natureza);
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

update publico.cnpj_estabelecimentos
   set tipo_unidade = case
     when complemento ~* '\y(APTO?|AP|APARTAMENTO)\y'       then 'apto'
     when complemento ~* '\y(CASA|SOBRADO|RESIDENCIA)\y'     then 'casa'
     when complemento ~* '\y(SALA|CONJ|ESCRITORIO|ANDAR)\y'  then 'sala'
     when complemento ~* '\y(LOJA|BOX|GALPAO|PAVILHAO)\y'    then 'loja'
     else null end
 where complemento is not null and tipo_unidade is null;

revoke all on function publico.unidade_do_complemento(text) from public, anon, authenticated;
revoke all on function publico.nome_pessoa(text)            from public, anon, authenticated;
revoke all on function public.carregar_cnpj(jsonb)          from public, anon, authenticated;
grant execute on function public.carregar_cnpj(jsonb) to service_role;
