// ImovelMap Radar — configuracao
//
// Nada de segredo aqui. A extensao so carrega a chave publicavel (a mesma
// que o site expoe no browser) e o JWT do proprio corretor. A service_role
// nunca sai do servidor — se saisse, estaria dentro de um .zip que qualquer
// usuario consegue descompactar.

export const SUPABASE_URL = "https://jmtrkygcndaqnrgobnqo.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nju5FZicYwkdvwy7vp-KXA_jjKyinLC";

export const EF_INGERIR = `${SUPABASE_URL}/functions/v1/ingerir`;
export const EF_DOSSIE = `${SUPABASE_URL}/functions/v1/dossie`;
export const AUTH_TOKEN_URL = `${SUPABASE_URL}/auth/v1/token`;

export const SITE_URL = "https://imovelmap.com";
export const PAGINA_CONECTAR = `${SITE_URL}/extensao/conectar`;

// Ritmo humano e teto por sessao (PROJETO.md §3.4): a extensao nao pode
// degradar a navegacao do corretor nem chamar atencao do anti-bot.
export const LIMITES = {
  itensPorLote: 100,        // a EF recusa acima de 200
  intervaloSyncMs: 15_000,  // agrupa capturas antes de subir
  maxItensPorSessao: 2000,
  backoffInicialMs: 5_000,
  backoffMaxMs: 10 * 60_000,
};

export const CHAVES = {
  refreshToken: "imovelmap.refreshToken",
  corretor: "imovelmap.corretor",
  portaisAtivos: "imovelmap.portaisAtivos",
  sitesGenericos: "imovelmap.sitesGenericos",
  contadores: "imovelmap.contadores",
  sessao: "imovelmap.sessao",
  debug: "imovelmap.debug",
  buscas: "imovelmap.buscas",
  agente: "imovelmap.agente",
};

// Modo varredura: nao dispara requisicao nossa. So rola a pagina no ritmo
// de gente, deixando a propria SPA pedir a proxima leva — o net-hook colhe.
// Nenhum trafego sintetico = nada para o anti-bot detectar.
export const VARREDURA = {
  passoPx: 900,
  pausaMinMs: 1400,
  pausaMaxMs: 3200,
  semNovidadeParaParar: 3, // rolagens seguidas sem crescer a pagina
  maxRolagens: 60,
};
