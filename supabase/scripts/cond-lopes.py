#!/usr/bin/env python3
"""
Diretorio de condominios do RS a partir do sitemap do Lopes.

O slug ja traz tudo: nome do predio + rua + numero. Nao visitamos pagina
nenhuma — o dado sai do proprio sitemap, que e publico e feito para ser lido.

  /condominios/rs/alvorada/bela-vista/REC26021/
      condominio-edificio-residencial-florida-village-estr-frederico-dihl-1021
   → nome "Condominio Edificio Residencial Florida Village"
     rua  "Estr Frederico Dihl", numero 1021, Alvorada / Bela Vista

Separar nome de rua: o ULTIMO marcador de tipo de via no slug abre o endereco.
"""
import json, re, sys

VIAS = ("rua","r","av","avenida","estr","estrada","trav","travessa","rod",
        "rodovia","al","alameda","praca","pca","largo","beco","via","acesso")

def titulo(s):
    return " ".join(w.capitalize() for w in s.split())

saida = open(sys.argv[2], "w")
n = 0
for linha in open(sys.argv[1]):
    u = linha.strip()
    m = re.match(r"https://www\.lopes\.com\.br/condominios/rs/([^/]+)/([^/]+)/(REC\d+)/(.+)$", u)
    if not m:
        continue
    cidade, bairro, rec, slug = m.groups()
    partes = slug.split("-")

    numero = partes[-1] if partes[-1].isdigit() else None
    corpo = partes[:-1] if numero else partes

    # ultimo marcador de via que nao seja a primeira palavra
    corte = None
    for i in range(len(corpo) - 1, 0, -1):
        if corpo[i] in VIAS:
            corte = i
            break
    if corte is None:
        nome, rua = " ".join(corpo), None
    else:
        nome = " ".join(corpo[:corte])
        rua  = " ".join(corpo[corte:])

    if not nome:
        continue
    saida.write(json.dumps({
        "ref": rec,
        "nome": titulo(nome),
        "rua": titulo(rua) if rua else None,
        "numero": numero,
        "cidade": titulo(cidade.replace("-", " ")),
        "bairro": titulo(bairro.replace("-", " ")),
        "url": u,
    }, ensure_ascii=False) + "\n")
    n += 1
print(f"{n} condominios", flush=True)
