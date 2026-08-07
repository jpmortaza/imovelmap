-- Diretório de condomínios do RS — 10.245 prédios com nome, rua e número.
--
-- ⭐ Sai de graça e sem visitar página nenhuma: o sitemap de condomínios do
--    Lopes tem o endereço inteiro no próprio slug da URL —
--    ".../rs/alvorada/bela-vista/REC26021/condominio-edificio-residencial-
--    florida-village-estr-frederico-dihl-1021" → nome, rua, número, cidade e
--    bairro. 10.197 dos 10.245 vêm com rua E número.
--
--    O robots.txt do Lopes bloqueia só /campanhas/ e /associado/. Sitemap é
--    material publicado para ser lido; não há requisição a página de anúncio.
--
-- Para que serve:
--   · dar NOME ao prédio no anúncio ("Ed. Florida Village" em vez de nada) —
--     é como o corretor reconhece o imóvel na rua e como fala dele ao dono
--   · o nome do condomínio é a chave de busca do CNPJ do condomínio, e o
--     quadro societário leva ao SÍNDICO — outra porta de entrada
--   · confere, de fonte independente, o número que inferimos pelo ITBI
--
-- Portais descartados por robots.txt (`Disallow: /` para `User-agent: *`):
-- chavesnamao.com.br, casaimoveis.com.br, imobiliariatempo.com.br,
-- cristofoli.com.br. Sondados e viáveis, mas não se coleta de quem pediu que
-- não coletassem.

create table if not exists publico.condominios (
  id         bigserial primary key,
  ref        text unique,
  nome       text not null,
  rua        text,
  rua_nucleo text,
  numero     text,
  cidade     text,
  bairro     text,
  url        text,
  cnpj       text,                    -- preenchido depois, pela Receita
  criado_em  timestamptz default now()
);

create index if not exists cond_end_idx    on publico.condominios (rua_nucleo, numero);
create index if not exists cond_nome_idx   on publico.condominios using gin (nome gin_trgm_ops);
create index if not exists cond_cidade_idx on publico.condominios (cidade);

alter table publico.condominios enable row level security;
revoke all on publico.condominios from anon, authenticated;
revoke all on sequence publico.condominios_id_seq from anon, authenticated;

create or replace function public.carregar_condominios(p_itens jsonb)
returns integer language plpgsql security definer
set search_path = public, publico, pg_temp as $$
declare v_n integer;
begin
  insert into publico.condominios (ref, nome, rua, rua_nucleo, numero, cidade, bairro, url)
  select x.ref, x.nome, x.rua, publico.nucleo_rua(x.rua),
         nullif(regexp_replace(coalesce(x.numero,''), '\D', '', 'g'), ''),
         x.cidade, x.bairro, x.url
    from jsonb_to_recordset(p_itens) as x(
      ref text, nome text, rua text, numero text,
      cidade text, bairro text, url text)
   where x.ref is not null and x.nome is not null
  on conflict (ref) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

-- Cruza condomínio com anúncio por rua + número + cidade e escreve o nome do
-- prédio em `complemento`. Não sobrescreve complemento que o portal informou.
create or replace function public.nomear_condominios(p_lote integer default 5000)
returns integer language plpgsql security definer
set search_path = public, publico, extensions, pg_temp as $$
declare v_n integer;
begin
  perform set_config('pg_trgm.similarity_threshold', '0.60', true);
  with alvo as (
    select i.id, publico.nucleo_rua(i.endereco) nucleo,
           regexp_replace(i.endereco_numero, '\D', '', 'g') num, i.city
      from public.imoveis i
     where i.complemento is null
       and i.endereco is not null and i.endereco_numero is not null
     limit p_lote),
  casado as (
    select distinct on (a.id) a.id, c.nome
      from alvo a
      join publico.condominios c
        on c.numero = a.num
       and c.rua_nucleo % a.nucleo
       and similarity(c.rua_nucleo, a.nucleo) >= 0.60
       and public.unaccent_simples(lower(c.cidade)) = public.unaccent_simples(lower(a.city))
     order by a.id, similarity(c.rua_nucleo, a.nucleo) desc)
  update public.imoveis i set complemento = casado.nome, updated_at = now()
    from casado where i.id = casado.id;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

revoke all on function public.carregar_condominios(jsonb)  from public, anon, authenticated;
revoke all on function public.nomear_condominios(integer)  from public, anon, authenticated;
grant execute on function public.carregar_condominios(jsonb) to service_role;
grant execute on function public.nomear_condominios(integer) to service_role;
