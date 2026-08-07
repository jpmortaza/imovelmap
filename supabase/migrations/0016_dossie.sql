-- ImovelMap — Fase 10 (parcial) · RPC do dossie
--
-- Monta num round-trip tudo que o banco sabe sobre um imovel, na forma que
-- o HUD da extensao (Fase 9) desenha:
--
--   🔥 TEMPERATURA 87           <- temperatura
--   🏢 também em: VivaReal, OLX <- grupo
--      3 preços diferentes      <- grupo
--   📉 R$ 890k -> 820k (-7,9% em 62 dias)  <- precos
--   💰 valor venal IPTU         <- publico.iptu_poa (vazio ate a Fase 7)
--
-- A EF `dossie` complementa com o que mora fora do banco (BrasilAPI, cartorio).

create or replace function public.dossie(p_imovel_id uuid, p_corretor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_imovel  public.imoveis%rowtype;
  v_ids     uuid[];
  v_grupo   jsonb;
  v_precos  jsonb;
  v_prop    jsonb;
  v_venal   numeric;
  v_pico    numeric;
  v_atual   numeric;
  v_dias    integer;
begin
  select * into v_imovel from public.imoveis where id = p_imovel_id;
  if not found then
    return jsonb_build_object('erro', 'imovel nao encontrado');
  end if;

  -- todos os anuncios do mesmo imovel real
  select coalesce(array_agg(distinct g2.imovel_id), array[p_imovel_id])
    into v_ids
  from public.imovel_grupos g1
  join public.imovel_grupos g2 on g2.grupo_id = g1.grupo_id
  where g1.imovel_id = p_imovel_id;
  if v_ids is null or array_length(v_ids, 1) is null then
    v_ids := array[p_imovel_id];
  end if;

  -- os outros anuncios: e daqui que sai o "sem exclusiva"
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'source', i.source, 'url', i.source_url,
           'price', i.price, 'title', i.title,
           'primeiraVez', i.first_seen_at
         ) order by i.price), '[]'::jsonb)
    into v_grupo
  from public.imoveis i
  where i.id = any(v_ids) and i.id <> p_imovel_id;

  -- historico de preco do grupo inteiro
  select coalesce(jsonb_agg(jsonb_build_object(
           'source', i.source, 'price', p.price, 'quando', p.captured_at
         ) order by p.captured_at), '[]'::jsonb)
    into v_precos
  from public.imovel_precos p
  join public.imoveis i on i.id = p.imovel_id
  where p.imovel_id = any(v_ids);

  select max(price), min(price) into v_pico, v_atual
  from public.imovel_precos where imovel_id = any(v_ids);

  select greatest(extract(day from now() - min(first_seen_at))::integer, 0)
    into v_dias
  from public.imoveis where id = any(v_ids);

  -- o que o corretor ja levantou de proprietario (isolado por RLS na tabela,
  -- e aqui filtrado explicitamente porque a funcao e security definer)
  select to_jsonb(pr) into v_prop
  from public.proprietarios pr
  where pr.imovel_id = p_imovel_id and pr.corretor_id = p_corretor;

  -- valor venal: casa pela inscricao imobiliaria quando a Fase 8 ja resolveu
  if v_imovel.inscricao_imobiliaria is not null then
    select iq.valor_venal into v_venal
    from publico.iptu_poa iq
    where iq.inscricao_imobiliaria = v_imovel.inscricao_imobiliaria
    limit 1;
  end if;

  return jsonb_build_object(
    'imovel', jsonb_build_object(
      'id', v_imovel.id,
      'source', v_imovel.source,
      'url', v_imovel.source_url,
      'title', v_imovel.title,
      'price', v_imovel.price,
      'area', v_imovel.area,
      'bedrooms', v_imovel.bedrooms,
      'bathrooms', v_imovel.bathrooms,
      'parkingSpaces', v_imovel.parking_spaces,
      'transactionType', v_imovel.transaction_type,
      'endereco', v_imovel.endereco,
      'enderecoNumero', v_imovel.endereco_numero,
      'complemento', v_imovel.complemento,
      'cep', v_imovel.cep,
      'neighborhood', v_imovel.neighborhood,
      'city', v_imovel.city,
      'state', v_imovel.state,
      'latitude', v_imovel.latitude,
      'longitude', v_imovel.longitude,
      'inscricaoImobiliaria', v_imovel.inscricao_imobiliaria,
      'enderecoConfianca', v_imovel.endereco_confianca,
      'primeiraVez', v_imovel.first_seen_at
    ),
    'temperatura', v_imovel.temperatura,
    'portais', (select count(distinct source) from public.imoveis where id = any(v_ids)),
    'grupo', v_grupo,
    'precos', v_precos,
    'precoPico', v_pico,
    'precoAtual', v_atual,
    'quedaPct', case when v_pico > 0 then round((v_pico - v_atual) / v_pico * 100, 1) else 0 end,
    'diasNoMercado', v_dias,
    'valorVenal', coalesce(v_venal, v_imovel.valor_venal),
    'proprietario', v_prop
  );
end;
$$;

comment on function public.dossie(uuid, uuid) is
  'Tudo que o banco sabe sobre um imovel, na forma que o HUD desenha. A EF `dossie` completa com BrasilAPI e cartorio.';

revoke all on function public.dossie(uuid, uuid) from public, anon, authenticated;
grant execute on function public.dossie(uuid, uuid) to service_role;
