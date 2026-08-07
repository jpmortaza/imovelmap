#!/usr/bin/env python3
"""
Sócios das empresas que estão em Porto Alegre.

Por que faltava: `cnpj-nomes.py` traz a razão social, e para MEI e empresário
individual isso já É o nome da pessoa. Mas para LTDA a razão social é o nome
da empresa — "VALENTINI & VALENTINI LTDA" no apartamento 101 não diz quem
mora lá. O quadro societário diz.

Layout de Socios (';' e latin-1):
   0 cnpj_basico   1 identificador (1=PJ, 2=PF, 3=estrangeiro)
   2 NOME_SOCIO    3 cpf/cnpj (o CPF já vem MASCARADO na fonte: ***441403**)
   4 qualificacao  5 data_entrada   8 nome_representante

Guardamos nome, se é pessoa física e a qualificação. O documento não entra:
não precisamos dele e ele não deve circular.
"""
import json, struct, time, urllib.request, zlib

BASE = "https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/2026-07-12"
UA = "ImovelMap/0.1 (+https://imovelmap.com)"

alvo = set()
for l in open("cnpj-poa.jsonl"):
    alvo.add(json.loads(l)["basico"])
alvo_b = {b.encode() for b in alvo}
print(f"{len(alvo)} cnpj basicos de POA a procurar", flush=True)

saida = open("cnpj-socios.jsonl", "w")
t0, total = time.time(), 0

for parte in range(10):
    url = f"{BASE}/Socios{parte}.zip"
    achados = 0
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=300) as r:
            cab = r.read(30)
            n_len, e_len = struct.unpack("<HH", cab[26:30])
            r.read(n_len + e_len)
            dec = zlib.decompressobj(-15)
            resto = b""
            while True:
                bloco = r.read(1 << 20)
                if not bloco:
                    break
                dados = dec.decompress(bloco)
                if not dados:
                    continue
                resto += dados
                *linhas, resto = resto.split(b"\n")
                for lb in linhas:
                    # filtro barato antes de decodificar
                    if len(lb) < 11 or lb[1:9] not in alvo_b:
                        continue
                    c = [x.strip('"') for x in
                         lb.decode("latin-1").strip().strip('"').split('";"')]
                    if len(c) < 5 or c[0] not in alvo:
                        continue
                    nome = (c[2] or "").strip()
                    if not nome:
                        continue
                    saida.write(json.dumps({
                        "basico": c[0],
                        "nome": nome,
                        "pf": c[1] == "2",
                        "qualificacao": c[4] or None,
                    }, ensure_ascii=False) + "\n")
                    achados += 1
        total += achados
        saida.flush()
        print(f"parte {parte}: {achados} (acum {total}, {int(time.time()-t0)}s)", flush=True)
    except Exception as e:
        print(f"parte {parte}: FALHOU {type(e).__name__} {e}", flush=True)

saida.close()
print(f"TOTAL {total} socios", flush=True)
