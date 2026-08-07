#!/usr/bin/env python3
"""
Extrai pontos de endereco do extrato OSM do Sul, filtrado ao RS.

⚠️ LICAO DA PRIMEIRA VERSAO: no Brasil o OSM mapeia COMERCIO muito mais do que
   predio residencial. Pegar "o ponto de endereco mais proximo" devolvia a
   padaria da esquina — gravamos 76 numeros errados com confianca 85 antes de
   conferir. Por isso agora marcamos o que cada ponto E:

     predio = valor da tag `building` (apartments, residential, yes...)
     poi    = tem shop/amenity/office/craft — comercio, nao moradia

   e guardamos `numero_limpo`, o inteiro inicial do numero. "3033 sala 609" e
   "7000/7020/7040/7060" nao servem de chave para o IPTU.

O OSM passa a dar CANDIDATOS. Quem decide qual e o predio certo e o cadastro
do IPTU, cruzando a area do anuncio. Duas fontes independentes concordando.
"""
import json, osmium, re

SUL, NORTE, OESTE, LESTE = -33.9, -27.0, -57.7, -49.6
POI = ("shop", "amenity", "office", "craft", "tourism", "healthcare", "leisure")

saida = open("osm-rs.jsonl", "w")
n = 0

def limpo(numero):
    m = re.match(r"^\s*(\d{1,6})", numero or "")
    return m.group(1) if m else None

def emitir(t, lat, lon):
    global n
    if not (SUL <= lat <= NORTE and OESTE <= lon <= LESTE):
        return
    saida.write(json.dumps({
        "rua":    t.get("addr:street"),
        "numero": t.get("addr:housenumber"),
        "numero_limpo": limpo(t.get("addr:housenumber")),
        "cep":    t.get("addr:postcode"),
        "cidade": t.get("addr:city"),
        "bairro": t.get("addr:suburb") or t.get("addr:neighbourhood"),
        "nome":   t.get("name"),
        "predio": t.get("building"),
        "poi":    any(k in t for k in POI),
        "lat": round(lat, 7), "lon": round(lon, 7),
    }, ensure_ascii=False) + "\n")
    n += 1
    if n % 50000 == 0:
        print(f"  {n}", flush=True)

for o in osmium.FileProcessor("rs.osm.pbf").with_locations().with_filter(
        osmium.filter.KeyFilter("addr:housenumber")):
    t = dict(o.tags)
    if not t.get("addr:street"):
        continue
    if o.type_str() == "n":
        emitir(t, o.location.lat, o.location.lon)
    elif o.type_str() == "w":
        try:
            pts = [(nd.location.lat, nd.location.lon) for nd in o.nodes if nd.location.valid()]
        except Exception:
            continue
        if pts:
            emitir(t, sum(p[0] for p in pts)/len(pts), sum(p[1] for p in pts)/len(pts))

saida.close()
print(f"TOTAL {n}", flush=True)
