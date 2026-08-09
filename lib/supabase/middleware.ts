import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const url = request.nextUrl;
  const isAuthRoute =
    url.pathname.startsWith("/login") || url.pathname.startsWith("/auth");

  // Publico: so a raiz (que E a tela de login) e a pagina da extensao.
  //
  // ⚠️ NADA MAIS E PUBLICO. O mapa mostra onde cada imovel esta e o que ja e
  //    nosso — e o mapa de oportunidades da operacao. A lista mostra endereco,
  //    matricula e contato. Aberto, entregaria a carteira e o resultado do
  //    enriquecimento para qualquer concorrente.
  const isPublica =
    url.pathname === "/" ||
    url.pathname.startsWith("/extensao");

  if (!user && !isAuthRoute && !isPublica) {
    // API responde 401 em JSON: redirecionar um fetch para /login devolveria
    // HTML e o cliente quebraria tentando ler como JSON.
    if (url.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "nao autenticado" }, { status: 401 });
    }
    const redirect = url.clone();
    redirect.pathname = "/";
    // guarda para onde a pessoa queria ir, para voltar depois de entrar
    redirect.search = "";
    redirect.searchParams.set("de", url.pathname + url.search);
    return NextResponse.redirect(redirect);
  }

  // Quem ja entrou nao ve a tela de login: vai para o PAINEL, que e o
  // territorio dele.
  if (user && (url.pathname === "/" || url.pathname === "/login")) {
    const redirect = url.clone();
    redirect.pathname = "/painel";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}
