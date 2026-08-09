import { redirect } from "next/navigation";

// `/login` continua existindo porque links antigos, o e-mail de acesso e o
// próprio middleware já apontavam para cá. Ele só encaminha para a raiz,
// preservando `?de=` — perder esse parâmetro devolveria a pessoa ao painel
// em vez do lugar que ela tentou abrir.
export default function Login({
  searchParams
}: {
  searchParams: { de?: string };
}) {
  const de = searchParams.de;
  redirect(de && de.startsWith("/") && !de.startsWith("//") ? `/?de=${encodeURIComponent(de)}` : "/");
}
