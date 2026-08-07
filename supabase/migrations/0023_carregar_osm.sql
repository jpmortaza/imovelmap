-- Carga em lote do cadastro de enderecos do OSM.
-- Vive em `public` porque o PostgREST so expoe `public` e `graphql_public` —
-- funcao em `publico` da 404 no rpc(), e a EF nem sempre confere o erro
-- (foi assim que `cachear_predios` ficou vazia sem erro nenhum).
create or replace function public.carregar_osm_enderecos(p_itens jsonb)
returns integer language plpgsql security definer
set search_path = public, publico, pg_temp as $$
declare v_n integer;
begin
  insert into publico.osm_enderecos
    (rua, rua_nucleo, numero, numero_limpo, cep, cidade, bairro, nome, predio, poi, lat, lon)
  select x.rua, publico.nucleo_rua(x.rua), x.numero, x.numero_limpo,
         nullif(regexp_replace(coalesce(x.cep,''), '\D', '', 'g'), ''),
         x.cidade, x.bairro, x.nome, x.predio, coalesce(x.poi, false), x.lat, x.lon
    from jsonb_to_recordset(p_itens) as x(
      rua text, numero text, numero_limpo text, cep text, cidade text,
      bairro text, nome text, predio text, poi boolean,
      lat double precision, lon double precision)
   where x.rua is not null and x.numero_limpo is not null
     and x.lat is not null and x.lon is not null
     and publico.nucleo_rua(x.rua) is not null;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

revoke all on function public.carregar_osm_enderecos(jsonb) from public, anon, authenticated;
grant execute on function public.carregar_osm_enderecos(jsonb) to service_role;
