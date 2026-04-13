/**
 * Owner Lookup Module
 *
 * Tries to find property owner information from FREE public Brazilian sources:
 * 1. ViaCEP - address enrichment from CEP
 * 2. ReceitaWS - CNPJ company/partner lookup (free, 3 req/min)
 * 3. Cartorio hint - which registry office to contact based on neighborhood
 * 4. IPTU URL - Porto Alegre municipal tax lookup
 */

export interface OwnerLookupResult {
  cepData?: {
    logradouro: string;
    complemento: string;
    bairro: string;
    localidade: string;
    uf: string;
  };
  cnpjData?: {
    nome: string;
    fantasia: string;
    socios: Array<{ nome: string; qual: string }>;
    situacao: string;
  };
  cartorioHint?: string;
  iptuUrl?: string;
  suggestions: string[];
}

// Porto Alegre cartorios de registro de imoveis por zona/bairro
const CARTORIO_ZONES: Record<string, string[]> = {
  "1o Registro de Imoveis de Porto Alegre - Centro": [
    "Centro",
    "Centro Historico",
    "Cidade Baixa",
    "Menino Deus",
    "Azenha",
    "Santana",
    "Farroupilha",
    "Praia de Belas",
  ],
  "2o Registro de Imoveis de Porto Alegre - Zona Leste": [
    "Moinhos de Vento",
    "Bela Vista",
    "Mont'Serrat",
    "Mont Serrat",
    "Montserrat",
    "Rio Branco",
    "Independencia",
    "Independência",
    "Floresta",
    "Bom Fim",
    "Auxiliadora",
    "Boa Vista",
    "Tres Figueiras",
    "Três Figueiras",
    "Chacara das Pedras",
    "Chácara das Pedras",
    "Higienopolis",
    "Higienópolis",
    "Jardim Botanico",
    "Jardim Botânico",
  ],
  "3o Registro de Imoveis de Porto Alegre - Zona Sudeste": [
    "Petropolis",
    "Petrópolis",
    "Bom Jesus",
    "Partenon",
    "Santo Antonio",
    "Santo Antônio",
    "Teresopolis",
    "Teresópolis",
    "Vila Jardim",
    "Medianeira",
    "Gloria",
    "Glória",
    "Cascata",
    "Santa Tereza",
    "Santa Teresa",
  ],
  "4o Registro de Imoveis de Porto Alegre - Zona Norte": [
    "Sarandi",
    "Rubem Berta",
    "Passo das Pedras",
    "Passo d'Areia",
    "Passo d Areia",
    "Cristo Redentor",
    "Jardim Sao Pedro",
    "Jardim São Pedro",
    "Jardim Lindoia",
    "Jardim Lindóia",
    "Jardim Itu",
    "Jardim Itu-Sabara",
    "Vila Ipiranga",
    "Sao Sebastiao",
    "São Sebastião",
    "Santa Maria Goretti",
    "Jardim Carvalho",
    "Sao Joao",
    "São João",
    "Navegantes",
    "Humaita",
    "Humaitá",
    "Anchieta",
    "Farrapos",
    "Marcilio Dias",
    "Marcílio Dias",
  ],
  "5o Registro de Imoveis de Porto Alegre - Zona Sul": [
    "Ipanema",
    "Tristeza",
    "Cavalhada",
    "Cristal",
    "Camaqua",
    "Camaquã",
    "Vila Assuncao",
    "Vila Assunção",
    "Pedra Redonda",
    "Espírito Santo",
    "Espirito Santo",
    "Guaruja",
    "Guarujá",
    "Vila Conceicao",
    "Vila Conceição",
    "Serraria",
    "Vila Nova",
    "Nonoai",
    "Medianeira",
    "Hípica",
    "Hipica",
    "Lami",
    "Belém Novo",
    "Belem Novo",
    "Ponta Grossa",
  ],
  "6o Registro de Imoveis de Porto Alegre - Zona Leste/Sul": [
    "Restinga",
    "Lomba do Pinheiro",
    "Agronomia",
    "Morro Santana",
    "Protasio Alves",
    "Protásio Alves",
    "Mario Quintana",
    "Mário Quintana",
  ],
};

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function findCartorio(neighborhood?: string): string | undefined {
  if (!neighborhood) return undefined;
  const norm = normalizeStr(neighborhood);

  for (const [cartorio, bairros] of Object.entries(CARTORIO_ZONES)) {
    for (const bairro of bairros) {
      if (normalizeStr(bairro) === norm) {
        return cartorio;
      }
    }
  }

  // Fallback: partial match
  for (const [cartorio, bairros] of Object.entries(CARTORIO_ZONES)) {
    for (const bairro of bairros) {
      if (normalizeStr(bairro).includes(norm) || norm.includes(normalizeStr(bairro))) {
        return cartorio;
      }
    }
  }

  return undefined;
}

async function fetchViaCep(cep: string): Promise<OwnerLookupResult["cepData"] | undefined> {
  const cleanCep = cep.replace(/\D/g, "");
  if (cleanCep.length !== 8) return undefined;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    if (data.erro) return undefined;
    return {
      logradouro: data.logradouro ?? "",
      complemento: data.complemento ?? "",
      bairro: data.bairro ?? "",
      localidade: data.localidade ?? "",
      uf: data.uf ?? "",
    };
  } catch {
    return undefined;
  }
}

async function fetchReceitaWs(
  cnpj: string
): Promise<OwnerLookupResult["cnpjData"] | undefined> {
  const cleanCnpj = cnpj.replace(/\D/g, "");
  if (cleanCnpj.length !== 14) return undefined;

  try {
    const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    if (data.status === "ERROR") return undefined;

    const socios = Array.isArray(data.qsa)
      ? data.qsa.map((s: { nome?: string; qual?: string }) => ({
          nome: s.nome ?? "",
          qual: s.qual ?? "",
        }))
      : [];

    return {
      nome: data.nome ?? "",
      fantasia: data.fantasia ?? "",
      socios,
      situacao: data.situacao ?? "",
    };
  } catch {
    return undefined;
  }
}

export async function lookupOwner(params: {
  cep?: string;
  cnpj?: string;
  neighborhood?: string;
  city?: string;
  endereco?: string;
}): Promise<OwnerLookupResult> {
  const { cep, cnpj, neighborhood, city, endereco } = params;

  // Run parallel requests
  const [cepData, cnpjData] = await Promise.all([
    cep ? fetchViaCep(cep) : Promise.resolve(undefined),
    cnpj ? fetchReceitaWs(cnpj) : Promise.resolve(undefined),
  ]);

  // Determine neighborhood from CEP data if not provided
  const resolvedNeighborhood = neighborhood || cepData?.bairro;
  const resolvedCity = city || cepData?.localidade;

  // Cartorio hint
  const cartorioHint = findCartorio(resolvedNeighborhood);

  // IPTU URL for Porto Alegre
  const isPortoAlegre =
    resolvedCity &&
    normalizeStr(resolvedCity).includes("porto alegre");

  const iptuUrl = isPortoAlegre
    ? "https://www2.portoalegre.rs.gov.br/smf/default.php?p_secao=156"
    : undefined;

  // Build suggestions
  const suggestions: string[] = [];

  if (cartorioHint) {
    suggestions.push(
      `Solicite a matricula atualizada no ${cartorioHint}. A matricula contem o nome completo do proprietario, CPF e historico de transacoes.`
    );
  } else if (resolvedNeighborhood) {
    suggestions.push(
      `Bairro "${resolvedNeighborhood}" nao encontrado no mapeamento de cartorios. Consulte o site do TJ-RS para identificar o cartorio competente.`
    );
  } else {
    suggestions.push(
      "Identifique o bairro do imovel para determinar qual Cartorio de Registro de Imoveis consultar."
    );
  }

  if (isPortoAlegre) {
    suggestions.push(
      "Consulte o IPTU do imovel em portoalegre.rs.gov.br (SMF) - o cadastro pode conter dados do proprietario."
    );
  }

  if (endereco) {
    suggestions.push(
      `Visite o imovel em "${endereco}" e converse com porteiros ou vizinhos para identificar o proprietario.`
    );
  }

  if (!cnpj) {
    suggestions.push(
      "Se o imovel pertence a uma empresa, tente buscar o CNPJ no Google Maps ou na fachada do predio."
    );
  }

  if (cnpjData && cnpjData.socios.length > 0) {
    const nomes = cnpjData.socios.map((s) => s.nome).join(", ");
    suggestions.push(
      `Socios encontrados via CNPJ: ${nomes}. Tente localizar contato desses socios.`
    );
  }

  suggestions.push(
    "Consulte o CREA-RS ou CAU-RS caso o imovel tenha placa de obra - pode indicar o responsavel tecnico e indiretamente o proprietario."
  );

  return {
    cepData,
    cnpjData,
    cartorioHint,
    iptuUrl,
    suggestions,
  };
}
