-- Duas coisas: os sócios das empresas, e o território do corretor.
--
-- ── SÓCIOS ──────────────────────────────────────────────────────────────
-- Para MEI e empresário individual a razão social já é o nome da pessoa. Mas
-- "VALENTINI & VALENTINI LTDA" no apartamento 101 não diz quem mora lá — o
-- quadro societário diz. 501.318 sócios das empresas de POA.
--
-- O CPF já vem MASCARADO na fonte (`***441403**`) e não é guardado: não
-- precisamos dele e ele não deve circular.
--
-- Exemplo do que isso produz: "Barão do Guaíba, 1000 · ap 801 → Elixir
-- Software Development LTDA → Carlos Alberto Bueno, (51) 3364-1140".
--
-- ── TERRITÓRIO ──────────────────────────────────────────────────────────
-- O corretor trabalha um bairro, não um catálogo. `corretores.bairros` guarda
-- o território, definido já no cadastro; `/painel` mostra o bairro inteiro com
-- mapa, quanto já é nosso e quanto é oportunidade.

create table if not exists publico.cnpj_socios (
  id           bigserial primary key,
  basico       text not null,
  nome         text not null,
  pf           boolean,
  qualificacao text
);
create index if not exists socios_basico_idx on publico.cnpj_socios (basico);
alter table publico.cnpj_socios enable row level security;
revoke all on publico.cnpj_socios from anon, authenticated;
revoke all on sequence publico.cnpj_socios_id_seq from anon, authenticated;

create or replace function public.carregar_socios(p_itens jsonb)
returns integer language plpgsql security definer
set search_path = public, publico, pg_temp as $$
declare v_n integer;
begin
  insert into publico.cnpj_socios (basico, nome, pf, qualificacao)
  select x.basico, x.nome, x.pf, x.qualificacao
    from jsonb_to_recordset(p_itens) as x(
      basico text, nome text, pf boolean, qualificacao text)
   where x.basico is not null and x.nome is not null;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

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
  casado as (
    select a.id, c.cnpj, c.basico, c.razao_social, c.natureza, c.fone,
           c.complemento, c.tipo_unidade
      from alvo a
      join publico.cnpj_estabelecimentos c
        on c.rua_nucleo = a.nucleo and c.numero = a.num and c.unidade = a.unid
      join publico.cnpj_densidade d
        on d.rua_nucleo = c.rua_nucleo and d.numero = c.numero and d.unidade = c.unidade
     where a.unid is not null and c.ativa
       and c.tipo_unidade in ('apto','casa')
       and c.razao_social is not null and d.n <= 3),
  achado as (
    select k.id,
           jsonb_agg(jsonb_build_object(
             'nome', case when k.natureza in ('2135','2313')
                          then publico.nome_pessoa(k.razao_social)
                          else k.razao_social end,
             'fone', k.fone,
             'local', k.fone like '51%',
             'complemento', k.complemento,
             'pessoaFisica', k.natureza in ('2135','2313'),
             'socios', (select jsonb_agg(s.nome order by s.nome)
                          from (select distinct nome from publico.cnpj_socios
                                 where basico = k.basico and pf limit 4) s)
           ) order by (k.natureza in ('2135','2313')) desc,
                      (k.fone like '51%') desc, k.razao_social) contatos
      from casado k group by k.id)
  update public.imoveis i
     set contatos_cnpj = achado.contatos, updated_at = now()
    from achado where i.id = achado.id;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

-- ── território ──────────────────────────────────────────────────────────
alter table public.corretores
  add column if not exists bairros text[] not null default '{}';

-- ⚠️ Coordenadas corrompidas encontradas ao montar o centro do bairro:
--    46 anúncios com o ponto decimal perdido (-30126 em vez de -30.126) e
--    147 em (0,0), a "ilha nula". A média da latitude do bairro dava -49,79,
--    que fica no oceano. Corrigido nos dados; e o centro passou a ser MEDIANA
--    dentro da caixa do RS, para um outlier não mover o mapa de novo.
update public.imoveis
   set latitude = latitude / 1000, longitude = longitude / 1000
 where abs(latitude) > 1000 and abs(longitude) > 1000
   and latitude / 1000 between -33.9 and -27.0
   and longitude / 1000 between -57.7 and -49.6;

update public.imoveis set latitude = null, longitude = null
 where latitude = 0 or longitude = 0;

create or replace function public.painel_bairro(p_cidade text, p_bairros text[])
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  with alvo as (
    select * from public.imoveis
     where is_active
       and (p_cidade is null or city = p_cidade)
       and (coalesce(array_length(p_bairros,1),0) = 0 or neighborhood = any(p_bairros))),
  geo as (
    select latitude la, longitude lo from alvo
     where latitude between -33.9 and -27.0 and longitude between -57.7 and -49.6)
  select jsonb_build_object(
    'total',        (select count(*) from alvo),
    'venda',        (select count(*) from alvo where transaction_type='sale'),
    'aluguel',      (select count(*) from alvo where transaction_type='rent'),
    'nossos',       (select count(*) from alvo where source='auxiliadorapredial.com.br'),
    'oportunidades',(select count(*) from alvo where source <> 'auxiliadorapredial.com.br'),
    'comMatricula', (select count(*) from alvo where matricula is not null),
    'comCandidatas',(select count(*) from alvo where matricula_candidatas is not null),
    'comContato',   (select count(*) from alvo where contatos_cnpj is not null),
    'caros',        (select count(*) from alvo where sobrepreco > 0.6),
    'novos7d',      (select count(*) from alvo where first_seen_at > now() - interval '7 days'),
    'precoMediano', (select percentile_cont(0.5) within group (order by price)
                       from alvo where transaction_type='sale' and price > 10000),
    'm2Mediano',    (select percentile_cont(0.5) within group (order by price/nullif(area,0))
                       from alvo where transaction_type='sale' and price > 10000 and area > 20),
    'centro',       (select jsonb_build_object(
                       'lat', percentile_cont(0.5) within group (order by la),
                       'lng', percentile_cont(0.5) within group (order by lo)) from geo),
    'bairros',      to_jsonb(p_bairros));
$$;

-- Só bairro/cidade que EXISTE na base entra na escolha do admin: atribuir um
-- bairro sem imóvel daria um painel vazio e a impressão de produto quebrado.
create or replace function public.bairros_da_cidade(p_cidade text)
returns table (bairro text, n bigint)
language sql stable security definer
set search_path = public, pg_temp as $$
  select neighborhood, count(*)
    from public.imoveis
   where is_active and neighborhood is not null
     and (p_cidade is null or city = p_cidade)
   group by 1 order by 2 desc;
$$;

create or replace function public.cidades_com_imoveis()
returns table (cidade text, n bigint)
language sql stable security definer
set search_path = public, pg_temp as $$
  select city, count(*) from public.imoveis
   where is_active and city is not null
   group by 1 having count(*) >= 20 order by 2 desc;
$$;

revoke all on function public.carregar_socios(jsonb)            from public, anon, authenticated;
revoke all on function public.casar_cnpj_lote(integer)          from public, anon, authenticated;
revoke all on function public.painel_bairro(text, text[])       from public, anon;
revoke all on function public.bairros_da_cidade(text)           from public, anon;
revoke all on function public.cidades_com_imoveis()             from public, anon;

grant execute on function public.carregar_socios(jsonb)         to service_role;
grant execute on function public.casar_cnpj_lote(integer)       to service_role;
grant execute on function public.painel_bairro(text, text[])    to authenticated, service_role;
grant execute on function public.bairros_da_cidade(text)        to authenticated, service_role;
grant execute on function public.cidades_com_imoveis()          to authenticated, service_role;
