-- ImovelMap — Fase 10 (parcial) · agrupar_duplicatas
--
-- A feature nº 1 do PROJETO.md §5: o mesmo imovel anunciado em varios
-- portais significa que o proprietario NAO deu exclusiva pra ninguem —
-- e o lead mais quente que existe pra quem quer agenciar.
--
-- `grupo_id` identifica o imovel do MUNDO REAL; cada linha de `imoveis` e
-- um anuncio dele. Tres criterios, do mais forte pro mais fraco:
--
--   cadastro  mesmo logradouro + numero (+ complemento)      confianca 95
--   geo       < 150 m + area ~igual + mesmos quartos         confianca 80
--   attrs     mesmo CEP + area ~igual + mesmos quartos       confianca 70
--
-- Sempre entre portais DIFERENTES: dois anuncios do mesmo portal costumam
-- ser unidades distintas do mesmo predio, nao duplicata.

create or replace function public.agrupar_duplicatas(p_imovel_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alvo    record;
  v_par     record;
  v_grupo   uuid;
  v_ligados integer := 0;
begin
  for v_alvo in
    select i.* from public.imoveis i
    where i.is_active
      and (p_imovel_id is null or i.id = p_imovel_id)
    order by i.first_seen_at
  loop
    for v_par in
      select c.id,
             case
               when c.endereco is not null and v_alvo.endereco is not null
                    and c.endereco_numero is not null
                    and c.endereco_numero = v_alvo.endereco_numero
                    and extensions.similarity(lower(c.endereco), lower(v_alvo.endereco)) > 0.6
                    and (c.complemento is null or v_alvo.complemento is null
                         or lower(c.complemento) = lower(v_alvo.complemento))
                 then 'cadastro'
               when c.geom is not null and v_alvo.geom is not null
                    and extensions.st_dwithin(c.geom, v_alvo.geom, 150)
                 then 'geo'
               else 'attrs'
             end as metodo
      from public.imoveis c
      where c.id <> v_alvo.id
        and c.is_active
        -- duplicata e entre portais diferentes
        and c.source <> v_alvo.source
        -- venda nao casa com aluguel
        and c.transaction_type is not distinct from v_alvo.transaction_type
        -- quartos: iguais, ou um dos dois sem informacao
        and (c.bedrooms is null or v_alvo.bedrooms is null
             or c.bedrooms = v_alvo.bedrooms)
        and (
          -- 1. mesmo endereco de rua + numero
          (c.endereco is not null and v_alvo.endereco is not null
           and c.endereco_numero is not null
           and c.endereco_numero = v_alvo.endereco_numero
           and extensions.similarity(lower(c.endereco), lower(v_alvo.endereco)) > 0.6)
          or
          -- 2. perto no mapa e com a mesma area (±5%)
          (c.geom is not null and v_alvo.geom is not null
           and extensions.st_dwithin(c.geom, v_alvo.geom, 150)
           and c.area is not null and v_alvo.area is not null
           and abs(c.area - v_alvo.area) <= greatest(v_alvo.area * 0.05, 1))
          or
          -- 3. mesmo CEP e mesma area
          (c.cep is not null and c.cep = v_alvo.cep
           and c.area is not null and v_alvo.area is not null
           and abs(c.area - v_alvo.area) <= greatest(v_alvo.area * 0.05, 1))
        )
    loop
      -- reaproveita o grupo que qualquer um dos dois ja tenha
      select g.grupo_id into v_grupo
      from public.imovel_grupos g
      where g.imovel_id in (v_alvo.id, v_par.id)
      limit 1;

      if v_grupo is null then
        v_grupo := gen_random_uuid();
      end if;

      insert into public.imovel_grupos (grupo_id, imovel_id, confianca, metodo)
      values
        (v_grupo, v_alvo.id,
         case v_par.metodo when 'cadastro' then 95 when 'geo' then 80 else 70 end,
         v_par.metodo),
        (v_grupo, v_par.id,
         case v_par.metodo when 'cadastro' then 95 when 'geo' then 80 else 70 end,
         v_par.metodo)
      on conflict (grupo_id, imovel_id) do nothing;

      v_ligados := v_ligados + 1;
      v_grupo := null;
    end loop;
  end loop;

  -- temperatura depende de "em quantos portais aparece": recalcula o que mudou
  perform public.calcular_temperatura(i.id)
  from public.imoveis i
  where p_imovel_id is null or i.id = p_imovel_id;

  return v_ligados;
end;
$$;

comment on function public.agrupar_duplicatas(uuid) is
  'Liga anuncios do mesmo imovel real entre portais diferentes. Alimenta o "sem exclusiva" da temperatura.';

revoke all on function public.agrupar_duplicatas(uuid) from public, anon, authenticated;
grant execute on function public.agrupar_duplicatas(uuid) to service_role;
