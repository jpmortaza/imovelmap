#!/usr/bin/env python3
"""
Extrai os estabelecimentos de PORTO ALEGRE do dump de CNPJ da Receita.

Por que isso serve para achar dono de imovel: milhoes de brasileiros abrem
empresa no endereco onde MORAM. O cadastro traz logradouro, numero,
COMPLEMENTO (onde vem "APT 501") e TELEFONE. Empresa registrada num
apartamento residencial e quase sempre o morador — e o morador de um imovel
anunciado costuma ser o proprietario.

Dado publico federal, publicado justamente para uso em massa.

⚠️ 21 GB no total, em 10 partes. NAO baixamos para disco: cada zip tem um
   unico membro, entao da para descomprimir em fluxo (zlib raw, -15) e jogar
   fora tudo que nao for municipio 8801. Sobra o que interessa.

Colunas (layout do Estabelecimentos, ';' e latin-1):
   0 cnpj_basico  1 ordem  2 dv  3 matriz/filial  4 fantasia
   5 situacao(02=ativa)   11 cnae   13 tipo_log  14 logradouro
  15 numero  16 COMPLEMENTO  17 bairro  18 cep  19 uf  20 municipio
  21 ddd1  22 tel1
"""
import io, json, struct, sys, time, urllib.request, zlib

BASE = "https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/2026-07-12"
POA  = "8801"
UA   = "ImovelMap/0.1 (+https://imovelmap.com)"
SAIDA = "cnpj-poa.jsonl"

def campos(linha):
    # csv simples: os campos vem sempre entre aspas e sem ';' interno
    return [c.strip('"') for c in linha.split('";"')] if linha else []

def processa(parte, saida):
    url = f"{BASE}/Estabelecimentos{parte}.zip"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    achados = 0
    lidos = 0
    with urllib.request.urlopen(req, timeout=300) as r:
        cab = r.read(30)
        n_len, e_len = struct.unpack("<HH", cab[26:30])
        r.read(n_len + e_len)                      # nome do membro + extra
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
                lidos += 1
                # filtro barato ANTES de decodificar: 99,7% das linhas morrem aqui
                if b'"8801"' not in lb:
                    continue
                c = campos(lb.decode("latin-1").strip().strip('"'))
                if len(c) < 23 or c[20] != POA:
                    continue
                saida.write(json.dumps({
                    "cnpj":   c[0] + c[1] + c[2],
                    "basico": c[0],
                    "fantasia": c[4] or None,
                    "ativa":  c[5] == "02",
                    "cnae":   c[11] or None,
                    "tipo_log": c[13] or None,
                    "logradouro": c[14] or None,
                    "numero": c[15] or None,
                    "complemento": c[16] or None,
                    "bairro": c[17] or None,
                    "cep":    c[18] or None,
                    "ddd":    c[21] or None,
                    "fone":   c[22] or None,
                }, ensure_ascii=False) + "\n")
                achados += 1
    return lidos, achados

t0 = time.time()
total = 0
with open(SAIDA, "w") as saida:
    for parte in range(10):
        try:
            lidos, achados = processa(parte, saida)
            total += achados
            saida.flush()
            print(f"parte {parte}: {lidos} linhas, {achados} em POA "
                  f"(acum {total}, {int(time.time()-t0)}s)", flush=True)
        except Exception as e:
            print(f"parte {parte}: FALHOU {type(e).__name__} {e}", flush=True)
print(f"TOTAL {total} estabelecimentos em Porto Alegre", flush=True)
