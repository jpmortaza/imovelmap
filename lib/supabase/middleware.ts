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

  // Publico: so a vitrine (`/`, que mostra numero agregado e nada mais) e a
  // pagina da extensao.
  //
  // ⚠️ O MAPA NAO E PUBLICO, e a API que o alimenta tambem nao. Ele mostra
  //    onde cada imovel esta e o que ja e nosso — e o mapa de oportunidades da
  //    operacao. Aberto, entregaria a carteira e o resultado do enriquecimento
  //    para qualquer concorrente. Vive em `/mapa`, atras do login.
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
    redirect.pathname = "/login";
    // guarda para onde a pessoa queria ir, para voltar depois do login
    redirect.searchParams.set("de", url.pathname + url.search);
    return NextResponse.redirect(redirect);
  }

  // Quem entra vai para o PAINEL, nao para a lista: a primeira tela do
  // corretor e o territorio dele, nao um catalogo.
  if (user && url.pathname === "/login") {
    const redirect = url.clone();
    redirect.pathname = "/painel";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}
