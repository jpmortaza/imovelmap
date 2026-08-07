-- ImovelMap — Fase 2 · j_num entende numero em formato brasileiro
--
-- O ImovelPayload canonico traz price/area como number, mas o fallback LLM
-- da EF `extrair-pagina` (Fase 11) e o JSON-LD de imobiliaria pequena
-- devolvem "R$ 4.500,00" e "88,5 m2". Sem isto, esses campos entram null.

create or replace function public.j_num(v text)
returns numeric
language plpgsql
immutable
as $$
declare
  s text;
begin
  s := regexp_replace(coalesce(v, ''), '[^0-9,.-]', '', 'g');
  if s = '' then
    return null;
  end if;

  if s ~ ',\d{1,2}$' then
    -- virgula decimal: "4.500,00" -> 4500.00
    s := replace(replace(s, '.', ''), ',', '.');
  elsif s ~ '^-?\d{1,3}(\.\d{3})+$' then
    -- ponto como separador de milhar: "1.234.567" -> 1234567
    s := replace(s, '.', '');
  else
    -- virgula sobrando e separador de milhar: "1,234,567" -> 1234567
    s := replace(s, ',', '');
  end if;

  return nullif(s, '')::numeric;
exception when others then
  return null;
end;
$$;
