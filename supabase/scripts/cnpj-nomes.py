#!/usr/bin/env python3
"""
Puxa a razao social dos CNPJ que estao em Porto Alegre.

⭐ Para EMPRESARIO INDIVIDUAL (natureza juridica 2135) e MEI, a razao social
   E O NOME DA PESSOA. Entao "empresa no apartamento 612" vira "Fulano de Tal,
   apartamento 612" — que e exatamente o que o corretor quer saber.

   Para sociedade (LTDA, SA) a razao social e o nome da empresa; ai o nome das
   pessoas viria do arquivo de Socios, que e outro passo.

Colunas de Empresas: 0 cnpj_basico  1 razao_social  2 natureza_juridica
                     3 qualificacao  4 capital_social  5 porte
"""
import json, struct, time, urllib.request, zlib

BASE = "https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/2026-07-12"
UA   = "ImovelMap/0.1 (+https://imovelmap.com)"

alvo = set()
for l in open("cnpj-poa.jsonl"):
    alvo.add(json.loads(l)["basico"])
print(f"{len(alvo)} cnpj basicos de POA a procurar", flush=True)
alvo_b = {b.encode() for b in alvo}

saida = open("cnpj-nomes.jsonl", "w")
t0, total = time.time(), 0

for parte in range(10):
    url = f"{BASE}/Empresas{parte}.zip"
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
                    # o basico sao os 8 primeiros digitos, entre aspas
                    if len(lb) < 11 or lb[1:9] not in alvo_b:
                        continue
                    c = [x.strip('"') for x in lb.decode("latin-1").strip().strip('"').split('";"')]
                    if len(c) < 6 or c[0] not in alvo:
                        continue
                    saida.write(json.dumps({
                        "basico": c[0],
                        "razao_social": c[1] or None,
                        "natureza": c[2] or None,
                        "capital": c[4] or None,
                        "porte": c[5] or None,
                    }, ensure_ascii=False) + "\n")
                    achados += 1
        total += achados
        saida.flush()
        print(f"parte {parte}: {achados} (acum {total}, {int(time.time()-t0)}s)", flush=True)
    except Exception as e:
        print(f"parte {parte}: FALHOU {type(e).__name__} {e}", flush=True)

saida.close()
print(f"TOTAL {total} razoes sociais", flush=True)
