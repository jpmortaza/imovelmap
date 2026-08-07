-- ImovelMap — casar anúncio com o ITBI: onde o produto encontra o dono
--
-- O que o ITBI resolve de uma vez:
--   · o NÚMERO DA PORTA que a Rede Gaúcha esconde (17.124 anúncios)
--   · o NÚMERO DA UNIDADE (apartamento)
--   · a MATRÍCULA e a ZONA do registro de imóveis — o ponteiro direto para a
--     certidão que nomeia o proprietário
--   · quanto e quando o imóvel foi vendido pela última vez
--
-- ⚠️ A REGRA QUE VALE MAIS QUE O ACERTO: quando a evidência não crava, esta
--    função NÃO escolhe. Já erramos duas vezes hoje por escolher — a inscrição
--    de um box de garagem, e o número de uma padaria a 40 m. Nos dois casos o
--    corretor pagaria por um documento errado. Aqui: se várias unidades do
--    prédio têm a mesma área (o normal numa torre), gravamos o NÚMERO DO
--    PRÉDIO, que é certo, e devolvemos as matrículas como CANDIDATAS, que é
--    honesto — e ainda assim reduz a busca de milhares para três.
--
-- Área: usamos `area_constr_privativa`, não a construída total. O anúncio
-- publica privativa; a construída total do IPTU inclui parede e área comum e
-- nunca bate. Foi o que tornava o casamento por IPTU tão ruim.

alter table public.imoveis
  add column if not exists matricula            text,
  add column if not exists matricula_zona       text,
  add column if not exists matricula_candidatas jsonb,
  add column if not exists unidade              text,
  add column if not exists ultima_venda_valor   numeric,
  add column if not exists ultima_venda_data    date,
  add column if not exists ano_construcao       smallint;

-- o endereço é o produto: `anon` não ganha nada disso. O corretor logado, sim.
grant select (matricula, matricula_zona, matricula_candidatas, unidade,
              ultima_venda_valor, ultima_venda_data, ano_construcao)
  on public.imoveis to authenticated;

create index if not exists imoveis_sem_itbi_idx
  on public.imoveis (city)
  where matricula is null and matricula_candidatas is null;

-- ---------------------------------------------------------------------------
-- `casar_itbi_lote` — processa um lote de imóveis de Porto Alegre.
--
-- Dois caminhos, conforme o anúncio traga ou não o número da porta:
--
--   COM número (Auxiliadora, Guarida): fixa rua+número e procura a unidade
--   pela área privativa.
--
--   SEM número (Rede Gaúcha): usa rua + CEP para reduzir a poucos prédios e
--   deixa a ÁREA escolher qual. Se só um prédio da rua tem unidade com aquela
--   área, o número foi descoberto — duas fontes independentes concordando.
-- ---------------------------------------------------------------------------
create or replace function public.casar_itbi_lote(
  p_lote integer default 200,
  p_tol  numeric default 0.05      -- tolerância de área: 5%
)
returns jsonb
language plpgsql
security definer
set search_path = public, publico, extensions, pg_temp
as $$
declare
  r              record;
  v_predios      integer;
  v_numero       text;
  v_unidades     integer;
  v_esc          record;
  v_cands        jsonb;
  v_tentados     integer := 0;
  v_com_matricula integer := 0;
  v_so_predio    integer := 0;
  v_sem          integer := 0;
begin
  -- `similarity(a,b) >= 0.6` nao usa o indice GIN; o operador `%` usa, e ele
  -- le este parametro. Com 354 mil linhas e a diferenca entre varrer e buscar:
  -- o lote de 250 caiu de "statement timeout" para 8 s.
  perform set_config('pg_trgm.similarity_threshold', '0.60', true);

  -- temp table fora do laco; `truncate` e nao `delete`, porque o papel da API
  -- roda com safeupdate e recusa DELETE sem WHERE.
  create temp table if not exists t_cand (
    n_endereco text, n_unidade text, matricula text, zona text,
    area_privativa numeric, base numeric, dt date, ano smallint) on commit drop;

  for r in
    select i.id, i.endereco, i.endereco_numero, i.cep, i.area,
           publico.nucleo_rua(i.endereco) nucleo
      from public.imoveis i
     where i.city ilike '%porto alegre%'
       and i.endereco is not null
       and i.area is not null and i.area > 0
       and i.matricula is null
       and i.matricula_candidatas is null
       and i.endereco_metodo is distinct from 'itbi-sem-match'
     limit p_lote
  loop
    v_tentados := v_tentados + 1;

    -- Universo de transações compatíveis com o anúncio: mesma rua, e — quando
    -- o anúncio traz número ou CEP — também isso. A área ainda não entra.
    truncate t_cand;

    insert into t_cand
    select distinct on (t.n_endereco, t.n_unidade)
           t.n_endereco, t.n_unidade, t.matricula, t.zona_registro,
           t.area_privativa, t.base_de_calculo, t.data_estimativa, t.ano_construcao
      from publico.itbi t
     where t.rua_nucleo is not null
       and t.rua_nucleo % r.nucleo
       and similarity(t.rua_nucleo, r.nucleo) >= 0.60
       and t.n_endereco is not null
       and t.area_privativa is not null and t.area_privativa > 0
       and (r.endereco_numero is null or t.n_endereco = regexp_replace(r.endereco_numero, '\D', '', 'g'))
       and (r.cep is null or t.cep is null or t.cep = regexp_replace(r.cep, '\D', '', 'g'))
     -- mesma unidade vendida mais de uma vez: fica a transação mais recente
     order by t.n_endereco, t.n_unidade, t.data_estimativa desc nulls last;

    -- Quantos PRÉDIOS distintos têm alguma unidade com a área do anúncio?
    select count(distinct n_endereco) into v_predios
      from t_cand
     where abs(area_privativa - r.area) / r.area <= p_tol;

    if v_predios <> 1 then
      -- zero: nunca transacionou, ou a rua não bate.
      -- mais de um: dois prédios da rua têm unidade dessa área — escolher
      -- seria chutar. Não chutamos.
      update public.imoveis set endereco_metodo = 'itbi-sem-match' where id = r.id;
      v_sem := v_sem + 1;
      continue;
    end if;

    select n_endereco into v_numero
      from t_cand
     where abs(area_privativa - r.area) / r.area <= p_tol
     limit 1;

    select count(*) into v_unidades
      from t_cand
     where n_endereco = v_numero
       and abs(area_privativa - r.area) / r.area <= p_tol;

    if v_unidades = 1 then
      -- Uma única unidade do prédio tem essa área: matrícula cravada.
      select * into v_esc
        from t_cand
       where n_endereco = v_numero
         and abs(area_privativa - r.area) / r.area <= p_tol;

      update public.imoveis
         set endereco_numero    = coalesce(endereco_numero, v_numero),
             unidade            = v_esc.n_unidade,
             matricula          = v_esc.matricula,
             matricula_zona     = v_esc.zona,
             ultima_venda_valor = v_esc.base,
             ultima_venda_data  = v_esc.dt,
             ano_construcao     = coalesce(ano_construcao, v_esc.ano),
             endereco_metodo    = 'itbi-unidade',
             endereco_confianca = greatest(coalesce(endereco_confianca, 0), 90),
             updated_at         = now()
       where id = r.id;
      v_com_matricula := v_com_matricula + 1;

    else
      -- Torre com apartamentos iguais: o número do prédio é certo, a unidade
      -- não. Entregamos as matrículas candidatas — de milhares para poucas.
      select jsonb_agg(jsonb_build_object(
               'unidade', n_unidade, 'matricula', matricula, 'zona', zona,
               'area', area_privativa, 'ultimaVenda', base, 'data', dt)
             order by n_unidade)
        into v_cands
        from t_cand
       where n_endereco = v_numero
         and abs(area_privativa - r.area) / r.area <= p_tol;

      update public.imoveis
         set endereco_numero      = coalesce(endereco_numero, v_numero),
             matricula_candidatas = v_cands,
             ano_construcao       = coalesce(ano_construcao,
                                    (select max(ano) from t_cand where n_endereco = v_numero)),
             endereco_metodo      = 'itbi-predio',
             endereco_confianca   = greatest(coalesce(endereco_confianca, 0), 75),
             updated_at           = now()
       where id = r.id;
      v_so_predio := v_so_predio + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'tentados', v_tentados,
    'matriculaCravada', v_com_matricula,
    'soPredio', v_so_predio,
    'semMatch', v_sem);
end;
$$;

revoke all on function public.casar_itbi_lote(integer, numeric) from public, anon, authenticated;
grant execute on function public.casar_itbi_lote(integer, numeric) to service_role;

-- Lote e trabalho de retaguarda: os 8 s de statement_timeout do padrao nao cabem.
alter role service_role set statement_timeout = '180s';
