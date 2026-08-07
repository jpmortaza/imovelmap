-- ImovelMap — Fase 3 · ingerir_lote
--
-- A EF `ingerir` recebe lotes da extensao (uma pagina de busca do ZAP =
-- ~40 imoveis de uma vez). Chamar upsert_imovel item a item seriam 40
-- round-trips EF->Postgres por rolagem de pagina. Aqui o loop roda dentro
-- do banco: 1 chamada por lote.
--
-- Cada item tem seu proprio bloco de excecao: item malformado nao derruba
-- o lote, so entra como erro no relatorio. Isso e o que permite a extensao
-- despejar payload de site desconhecido sem medo.

create or replace function public.ingerir_lote(
  p_itens    jsonb,
  p_corretor uuid,
  p_portal   text default null,
  p_modo     text default 'passivo'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item        jsonb;
  v_id          uuid;
  v_existia     boolean;
  v_novos       integer := 0;
  v_atualizados integer := 0;
  v_erros       integer := 0;
  v_resultados  jsonb := '[]'::jsonb;
  v_erro        text;
  v_modo        text;
begin
  if jsonb_typeof(p_itens) <> 'array' then
    raise exception 'ingerir_lote: p_itens precisa ser um array';
  end if;

  -- modo fora do dominio vira 'passivo' em vez de estourar o check de capturas
  v_modo := case when p_modo in ('passivo', 'ativo', 'varredura')
                 then p_modo else 'passivo' end;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    begin
      select exists (
        select 1 from public.imoveis
        where source = v_item ->> 'source'
          and external_id = v_item ->> 'id'
      ) into v_existia;

      v_id := public.upsert_imovel(v_item);

      if v_existia then
        v_atualizados := v_atualizados + 1;
      else
        v_novos := v_novos + 1;
      end if;

      insert into public.capturas (corretor_id, imovel_id, origem, modo, url, portal)
      values (p_corretor, v_id, 'extensao', v_modo,
              v_item ->> 'url',
              coalesce(p_portal, v_item ->> 'source'));

      v_resultados := v_resultados || jsonb_build_object(
        'externalId', v_item ->> 'id',
        'ok', true, 'id', v_id, 'novo', not v_existia
      );

    exception when others then
      v_erros := v_erros + 1;
      get stacked diagnostics v_erro = message_text;
      v_resultados := v_resultados || jsonb_build_object(
        'externalId', v_item ->> 'id',
        'ok', false, 'erro', v_erro
      );
    end;
  end loop;

  return jsonb_build_object(
    'total',       jsonb_array_length(p_itens),
    'novos',       v_novos,
    'atualizados', v_atualizados,
    'erros',       v_erros,
    'resultados',  v_resultados
  );
end;
$$;

comment on function public.ingerir_lote(jsonb, uuid, text, text) is
  'Ingestao em lote vinda da extensao. Um bloco de excecao por item: payload sujo nao derruba o lote.';

-- so o backend (EF com service role) chama; nunca o corretor direto
revoke all on function public.ingerir_lote(jsonb, uuid, text, text) from public, anon, authenticated;
grant execute on function public.ingerir_lote(jsonb, uuid, text, text) to service_role;
