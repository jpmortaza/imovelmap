-- ImovelMap — quem anuncia o imóvel, e o telefone dele
--
-- O caminho mais curto até o dono não é o cartório: é o próprio anúncio.
-- Quando o imóvel é anunciado por **proprietário direto (FSBO)**, o telefone
-- publicado É o do dono — publicado por ele, para ser contatado.
--
-- ⭐ O detector de FSBO saiu de graça: anúncio de imobiliária traz **CRECI**.
--    Sem CRECI + telefone pessoal = quase sempre particular.
--
-- E quando o mesmo imóvel aparece em vários portais (`imovel_grupos`), basta
-- UM deles ser anúncio de particular para o telefone do dono aparecer — mesmo
-- que os outros quatro sejam de imobiliária. É por isso que o cruzamento de
-- anúncios vale mais que qualquer base comprada.

alter table public.imoveis
  add column if not exists anunciante        text,
  add column if not exists anunciante_creci  text,
  add column if not exists telefones         text[] not null default '{}',
  add column if not exists whatsapp          text,
  add column if not exists tipo_anunciante   text
    check (tipo_anunciante in ('proprietario', 'imobiliaria', 'corretor', 'desconhecido'));

comment on column public.imoveis.telefones is
  'Telefones publicados NO anúncio. Em anúncio de particular, é o do proprietário.';
comment on column public.imoveis.tipo_anunciante is
  'proprietario = FSBO (sem CRECI) — o lead mais quente que existe.';

create index if not exists imoveis_fsbo_idx on public.imoveis (tipo_anunciante)
  where tipo_anunciante = 'proprietario';
create index if not exists imoveis_com_telefone_idx on public.imoveis (id)
  where array_length(telefones, 1) > 0;

-- ------------------------------------------------ upsert entende os campos
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
  v_fones     text[];
  v_anun      text;
begin
  if coalesce(p ->> 'source', '') = '' or coalesce(p ->> 'id', '') = '' then
    raise exception 'upsert_imovel: payload exige "source" e "id"';
  end if;

  v_price := public.j_num(p ->> 'price');

  v_tipo := case lower(coalesce(p ->> 'transactionType', ''))
              when 'sale' then 'sale' when 'venda' then 'sale'
              when 'rent' then 'rent' when 'aluguel' then 'rent'
              when 'locacao' then 'rent' else null end;

  v_images := case
    when jsonb_typeof(p -> 'images') = 'array' then (
      select coalesce(array_agg(value #>> '{}'), '{}'::text[])
      from jsonb_array_elements(p -> 'images') where value #>> '{}' is not null)
    else '{}'::text[] end;

  -- telefones: só dígitos, sem repetir, descartando o que não é telefone BR
  v_fones := case
    when jsonb_typeof(p -> 'telefones') = 'array' then (
      select coalesce(array_agg(distinct t), '{}'::text[])
      from (
        select regexp_replace(value #>> '{}', '\D', '', 'g') as t
        from jsonb_array_elements(p -> 'telefones')
      ) x
      where length(t) between 10 and 13)
    else '{}'::text[] end;

  -- tipo do anunciante: CRECI é a assinatura de imobiliária
  v_anun := case
    when coalesce(p ->> 'tipoAnunciante', '') <> '' then p ->> 'tipoAnunciante'
    when coalesce(p ->> 'anuncianteCreci', '') <> '' then 'imobiliaria'
    when coalesce(p ->> 'anunciante', '') <> ''      then 'imobiliaria'
    when array_length(v_fones, 1) > 0                then 'proprietario'
    else 'desconhecido' end;

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
    images, image_count, published_at, scraped_at, last_seen_at, is_active,
    anunciante, anunciante_creci, telefones, whatsapp, tipo_anunciante
  )
  values (
    p ->> 'source', p ->> 'id', coalesce(p ->> 'url', ''), p ->> 'title',
    v_tipo, p ->> 'propertyType', p ->> 'propertySubType',
    v_price, p ->> 'priceFormatted',
    public.j_num(p ->> 'condominiumFee'), public.j_num(p ->> 'iptu'),
    public.j_num(p ->> 'pricePerSqm'), public.j_num(p ->> 'area'),
    public.j_int(p ->> 'bedrooms'), public.j_int(p ->> 'bathrooms'),
    public.j_int(p ->> 'parkingSpaces'),
    p ->> 'endereco', p ->> 'enderecoNumero', p ->> 'complemento',
    nullif(regexp_replace(coalesce(p ->> 'cep', ''), '\D', '', 'g'), ''),
    p ->> 'neighborhood', p ->> 'city', p ->> 'state',
    public.j_num(p ->> 'latitude'), public.j_num(p ->> 'longitude'),
    v_images,
    coalesce(public.j_int(p ->> 'imageCount'), array_length(v_images, 1), 0),
    public.j_ts(p ->> 'publishedAt'),
    coalesce(public.j_ts(p ->> 'scrapedAt'), now()), now(), true,
    p ->> 'anunciante', p ->> 'anuncianteCreci', v_fones,
    nullif(regexp_replace(coalesce(p ->> 'whatsapp', ''), '\D', '', 'g'), ''),
    v_anun
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
    -- telefone só cresce: um portal pode publicar o que o outro esconde
    telefones         = (select coalesce(array_agg(distinct t), '{}'::text[])
                         from unnest(imoveis.telefones || excluded.telefones) t),
    whatsapp          = coalesce(excluded.whatsapp,          imoveis.whatsapp),
    anunciante        = coalesce(excluded.anunciante,        imoveis.anunciante),
    anunciante_creci  = coalesce(excluded.anunciante_creci,  imoveis.anunciante_creci),
    -- 'proprietario' nunca é rebaixado: se um portal revelou que é particular,
    -- continua sendo particular mesmo que outro anuncie via imobiliária
    tipo_anunciante   = case
                          when imoveis.tipo_anunciante = 'proprietario' then 'proprietario'
                          when excluded.tipo_anunciante = 'desconhecido' then imoveis.tipo_anunciante
                          else excluded.tipo_anunciante end,
    scraped_at        = excluded.scraped_at,
    last_seen_at      = now(),
    is_active         = true
  returning id into v_id;

  if v_price is not null and (not v_existia or v_old_price is distinct from v_price) then
    insert into public.imovel_precos (imovel_id, price) values (v_id, v_price);
  end if;

  return v_id;
end;
$$;

revoke all on function public.upsert_imovel(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_imovel(jsonb) to service_role;

-- anon NÃO vê telefone: é o contato, é o produto
grant select (
  id, title, transaction_type, property_type, property_sub_type,
  price, price_formatted, condominium_fee, iptu, price_per_sqm,
  area, bedrooms, bathrooms, parking_spaces,
  neighborhood, city, state, latitude, longitude,
  images, image_count, source, source_url,
  published_at, first_seen_at, last_seen_at, is_active
) on public.imoveis to anon;
