-- ImovelMap — Fase 2 · RPCs
-- As 5 que o codigo do app ja chama:
--   upsert_imovel            app/api/extracoes/run/route.ts  (service role)
--   distribuir_imoveis_do_dia app/api/cron/distribuir/route.ts (service role)
--   match_alertas_novos       app/api/cron/distribuir/route.ts (service role)
--   get_lease_atual           app/api/painel/lease/route.ts    (usuario)
--   marcar_trabalhado         app/api/painel/marcar/route.ts   (usuario)
-- + calcular_temperatura (PROJETO.md §6), que alimenta o HUD da Fase 9.

-- ------------------------------------------------------------- coercao segura
-- a extensao (Fase 3) manda payload de origem desconhecida: nunca deixar
-- um campo malformado derrubar o lote inteiro.
create or replace function public.j_num(v text)
returns numeric language plpgsql immutable as $$
begin
  return nullif(trim(v), '')::numeric;
exception when others then return null;
end;
$$;

create or replace function public.j_int(v text)
returns integer language plpgsql immutable as $$
begin
  return round(nullif(trim(v), '')::numeric)::integer;
exception when others then return null;
end;
$$;

create or replace function public.j_ts(v text)
returns timestamptz language plpgsql immutable as $$
begin
  return nullif(trim(v), '')::timestamptz;
exception when others then return null;
end;
$$;

-- --------------------------------------------------------------- upsert_imovel
-- recebe o ImovelPayload (camelCase) e grava em snake_case.
-- update nunca apaga dado bom com null: coalesce(excluded, atual).
create or replace function public.upsert_imovel(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id        uuid;
  v_price     numeric;
  v_old_price numeric;
  v_existia   boolean;
  v_images    text[];
  v_tipo      text;
begin
  if coalesce(p ->> 'source', '') = '' or coalesce(p ->> 'id', '') = '' then
    raise exception 'upsert_imovel: payload exige "source" e "id"';
  end if;

  v_price := public.j_num(p ->> 'price');

  -- normaliza transaction_type (a extensao pode mandar em portugues)
  v_tipo := case lower(coalesce(p ->> 'transactionType', ''))
              when 'sale'     then 'sale'
              when 'venda'    then 'sale'
              when 'rent'     then 'rent'
              when 'aluguel'  then 'rent'
              when 'locacao'  then 'rent'
              else null
            end;

  v_images := case
    when jsonb_typeof(p -> 'images') = 'array' then (
      select coalesce(array_agg(value #>> '{}'), '{}'::text[])
      from jsonb_array_elements(p -> 'images')
      where value #>> '{}' is not null
    )
    else '{}'::text[]
  end;

  select id, price into v_id, v_old_price
  from public.imoveis
  where source = p ->> 'source' and external_id = p ->> 'id';

  v_existia := v_id is not null;

  insert into public.imoveis (
    source, external_id, source_url, title,
    transaction_type, property_type, property_sub_type,
    price, price_formatted, condominium_fee, iptu, price_per_sqm,
    area, bedrooms, bathrooms, parking_spaces,
    endereco, endereco_numero, complemento, cep,
    neighborhood, city, state, latitude, longitude,
    images, image_count, published_at, scraped_at, last_seen_at, is_active
  )
  values (
    p ->> 'source',
    p ->> 'id',
    coalesce(p ->> 'url', ''),
    p ->> 'title',
    v_tipo,
    p ->> 'propertyType',
    p ->> 'propertySubType',
    v_price,
    p ->> 'priceFormatted',
    public.j_num(p ->> 'condominiumFee'),
    public.j_num(p ->> 'iptu'),
    public.j_num(p ->> 'pricePerSqm'),
    public.j_num(p ->> 'area'),
    public.j_int(p ->> 'bedrooms'),
    public.j_int(p ->> 'bathrooms'),
    public.j_int(p ->> 'parkingSpaces'),
    p ->> 'endereco',
    p ->> 'enderecoNumero',
    p ->> 'complemento',
    nullif(regexp_replace(coalesce(p ->> 'cep', ''), '\D', '', 'g'), ''),
    p ->> 'neighborhood',
    p ->> 'city',
    p ->> 'state',
    public.j_num(p ->> 'latitude'),
    public.j_num(p ->> 'longitude'),
    v_images,
    coalesce(public.j_int(p ->> 'imageCount'), array_length(v_images, 1), 0),
    public.j_ts(p ->> 'publishedAt'),
    coalesce(public.j_ts(p ->> 'scrapedAt'), now()),
    now(),
    true
  )
  on conflict (source, external_id) do update set
    source_url        = coalesce(nullif(excluded.source_url, ''), imoveis.source_url),
    title             = coalesce(excluded.title,             imoveis.title),
    transaction_type  = coalesce(excluded.transaction_type,  imoveis.transaction_type),
    property_type     = coalesce(excluded.property_type,     imoveis.property_type),
    property_sub_type = coalesce(excluded.property_sub_type, imoveis.property_sub_type),
    price             = coalesce(excluded.price,             imoveis.price),
    price_formatted   = coalesce(excluded.price_formatted,   imoveis.price_formatted),
    condominium_fee   = coalesce(excluded.condominium_fee,   imoveis.condominium_fee),
    iptu              = coalesce(excluded.iptu,              imoveis.iptu),
    price_per_sqm     = coalesce(excluded.price_per_sqm,     imoveis.price_per_sqm),
    area              = coalesce(excluded.area,              imoveis.area),
    bedrooms          = coalesce(excluded.bedrooms,          imoveis.bedrooms),
    bathrooms         = coalesce(excluded.bathrooms,         imoveis.bathrooms),
    parking_spaces    = coalesce(excluded.parking_spaces,    imoveis.parking_spaces),
    endereco          = coalesce(excluded.endereco,          imoveis.endereco),
    endereco_numero   = coalesce(excluded.endereco_numero,   imoveis.endereco_numero),
    complemento       = coalesce(excluded.complemento,       imoveis.complemento),
    cep               = coalesce(excluded.cep,               imoveis.cep),
    neighborhood      = coalesce(excluded.neighborhood,      imoveis.neighborhood),
    city              = coalesce(excluded.city,              imoveis.city),
    state             = coalesce(excluded.state,             imoveis.state),
    latitude          = coalesce(excluded.latitude,          imoveis.latitude),
    longitude         = coalesce(excluded.longitude,         imoveis.longitude),
    images            = case when array_length(excluded.images, 1) > 0
                             then excluded.images else imoveis.images end,
    image_count       = greatest(excluded.image_count, imoveis.image_count),
    published_at      = coalesce(excluded.published_at,      imoveis.published_at),
    scraped_at        = excluded.scraped_at,
    last_seen_at      = now(),
    is_active         = true
  returning id into v_id;

  -- historico de preco: primeira vez, ou mudou
  if v_price is not null and (not v_existia or v_old_price is distinct from v_price) then
    insert into public.imovel_precos (imovel_id, price) values (v_id, v_price);
  end if;

  return v_id;
end;
$$;

comment on function public.upsert_imovel(jsonb) is
  'Recebe ImovelPayload (lib/scrapers/types.ts) e faz upsert por (source, external_id). Alimenta imovel_precos.';

-- ------------------------------------------------------- calcular_temperatura
-- 0-100. Quanto mais quente, mais provavel que o proprietario aceite
-- trocar de corretor: muitos portais + preco caindo + tempo parado.
create or replace function public.calcular_temperatura(p_imovel_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_portais   integer := 1;
  v_dias      integer := 0;
  v_queda     numeric := 0;
  v_temp      integer;
begin
  -- 1. em quantos portais o mesmo imovel do mundo real aparece
  select count(distinct i.source) into v_portais
  from public.imovel_grupos g1
  join public.imovel_grupos g2 on g2.grupo_id = g1.grupo_id
  join public.imoveis i on i.id = g2.imovel_id
  where g1.imovel_id = p_imovel_id;
  v_portais := greatest(coalesce(v_portais, 1), 1);

  -- 2. dias no mercado
  select greatest(extract(day from now() - first_seen_at)::integer, 0)
    into v_dias
  from public.imoveis where id = p_imovel_id;

  -- 3. queda percentual do preco desde o primeiro registro
  select case
           when max(price) > 0 then
             greatest((max(price) - min(price)) / max(price) * 100, 0)
           else 0
         end
    into v_queda
  from public.imovel_precos where imovel_id = p_imovel_id;

  v_temp := least(
    100,
    -- sem exclusiva: 2 portais = 20, 3+ = 40
    least((v_portais - 1) * 20, 40)
    -- queda de preco: 10% de queda = 30 pontos
    + least(round(coalesce(v_queda, 0) * 3)::integer, 30)
    -- tempo parado: 60 dias = 30 pontos
    + least(round(coalesce(v_dias, 0) * 0.5)::integer, 30)
  );

  update public.imoveis set temperatura = v_temp where id = p_imovel_id;
  return v_temp;
end;
$$;

-- --------------------------------------------------- distribuir_imoveis_do_dia
-- a cota diaria. Cada imovel vai para um unico corretor (exclusividade
-- garantida pelo unique (imovel_id, dia)); imovel ja distribuido antes
-- nao volta a circular.
create or replace function public.distribuir_imoveis_do_dia(p_dia date default current_date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_corretor  record;
  v_ja        integer;
  v_restante  integer;
  v_inseridos integer;
  v_total     integer := 0;
begin
  for v_corretor in
    select id, cota_diaria from public.corretores
    where ativo is true
    order by created_at
  loop
    select count(*)::integer into v_ja
    from public.distribuicoes
    where corretor_id = v_corretor.id and dia = p_dia;

    v_restante := greatest(v_corretor.cota_diaria - v_ja, 0);
    continue when v_restante = 0;

    insert into public.distribuicoes (corretor_id, imovel_id, dia)
    select v_corretor.id, i.id, p_dia
    from public.imoveis i
    where i.is_active
      and not exists (
        select 1 from public.distribuicoes d where d.imovel_id = i.id
      )
    order by i.temperatura desc, i.first_seen_at desc
    limit v_restante
    on conflict (imovel_id, dia) do nothing;

    get diagnostics v_inseridos = row_count;
    v_total := v_total + v_inseridos;
  end loop;

  return v_total;
end;
$$;

-- --------------------------------------------------------- get_lease_atual
-- a carteira do dia do corretor logado. Usa auth.uid().
create or replace function public.get_lease_atual(p_dia date default current_date)
returns table (
  id            uuid,
  imovel_id     uuid,
  dia           date,
  status        text,
  outcome       text,
  nota          text,
  trabalhado_em timestamptz,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.id, d.imovel_id, d.dia, d.status, d.outcome,
         d.nota, d.trabalhado_em, d.created_at
  from public.distribuicoes d
  where d.corretor_id = auth.uid()
    and d.dia = p_dia
  order by d.created_at;
$$;

-- --------------------------------------------------------- marcar_trabalhado
create or replace function public.marcar_trabalhado(
  p_distribuicao_id uuid,
  p_outcome         text default null,
  p_nota            text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok integer;
begin
  update public.distribuicoes
     set status        = 'trabalhado',
         outcome       = coalesce(nullif(trim(p_outcome), ''), outcome),
         nota          = coalesce(nullif(trim(p_nota), ''), nota),
         trabalhado_em = now()
   where id = p_distribuicao_id
     and corretor_id = auth.uid();

  get diagnostics v_ok = row_count;
  return v_ok > 0;
end;
$$;

-- --------------------------------------------------------- match_alertas_novos
-- cruza os imoveis que entraram no dia com os alertas ativos.
-- campos vazios no alerta ('' vindo do form) contam como "sem filtro".
create or replace function public.match_alertas_novos(p_dia date default current_date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inseridos integer;
begin
  insert into public.notificacoes (corretor_id, imovel_id, alerta_id, tipo, titulo, mensagem)
  select a.corretor_id, i.id, a.id, 'alerta', a.nome, i.title
  from public.alertas a
  join public.imoveis i
    on  i.is_active
    and i.first_seen_at >= p_dia::timestamptz
    and i.first_seen_at <  (p_dia + 1)::timestamptz
    and (nullif(a.city, '')             is null or i.city         ilike '%' || a.city || '%')
    and (nullif(a.neighborhood, '')     is null or i.neighborhood ilike '%' || a.neighborhood || '%')
    and (nullif(a.transaction_type, '') is null or i.transaction_type = a.transaction_type)
    and (nullif(a.property_type, '')    is null or i.property_type    = a.property_type)
    and (a.price_min    is null or i.price          >= a.price_min)
    and (a.price_max    is null or i.price          <= a.price_max)
    and (a.area_min     is null or i.area           >= a.area_min)
    and (a.area_max     is null or i.area           <= a.area_max)
    and (a.bedrooms_min is null or i.bedrooms       >= a.bedrooms_min)
    and (a.bathrooms_min is null or i.bathrooms     >= a.bathrooms_min)
    and (a.parking_min  is null or i.parking_spaces >= a.parking_min)
  join public.corretores c on c.id = a.corretor_id and c.ativo
  where a.ativo
  on conflict (alerta_id, imovel_id) do nothing;

  get diagnostics v_inseridos = row_count;
  return v_inseridos;
end;
$$;
