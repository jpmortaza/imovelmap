-- Numero PUBLICADO nao e a mesma coisa que numero INFERIDO.
--
-- ⚠️ MEDIDO, NAO SUPOSTO. Teste cego: escondi o numero que a Auxiliadora e a
--    Guarida publicam, deixei a inferencia por rua+area escolher e comparei
--    com a verdade. Resultado em 544 enderecos conhecidos de Porto Alegre:
--
--      sem CEP, so rua + area privativa ......... 56,4% de acerto
--      com CEP + area privativa ................. 78,9% de acerto
--
--    E a tolerancia de area quase nao muda nada — 78,6% / 82,8% / 79,1% para
--    1% / 2% / 3%. O erro nao vem de casar area frouxo: e estrutural. Quando o
--    predio certo simplesmente nao transacionou desde 2020, o "unico
--    candidato" daquele CEP passa a ser o predio vizinho, e ele casa.
--
--    Ou seja: ~80% e o TETO do metodo, nao um parametro a ajustar.
--
-- Consequencias, todas deliberadas:
--   · a coluna `numero_inferido` marca a diferenca, e a UI avisa em amarelo
--   · confianca 78 (inferido) contra 90 (publicado)
--   · a MATRICULA herda a duvida do numero, e a pagina diz isso
--   · inferir SEM CEP (56%) deixou de ser feito: e chute, nao inferencia
--
-- 4 em 5 e um otimo ponto de partida para um corretor. Apresentar isso como
-- fato e que nao da — ele bate na porta errada ou paga a certidao errada.

alter table public.imoveis
  add column if not exists numero_inferido boolean not null default false;

grant select (numero_inferido) on public.imoveis to authenticated;

-- Retroativo: a Rede Gaucha nunca publica numero, entao todo numero dela que
-- saiu do ITBI e inferido. Auxiliadora e Guarida publicam.
update public.imoveis
   set numero_inferido = true,
       endereco_confianca = least(coalesce(endereco_confianca, 78), 78)
 where source = 'redegauchadeimoveis.com.br'
   and endereco_metodo in ('itbi-unidade','itbi-predio');
