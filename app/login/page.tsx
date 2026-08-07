import { Suspense } from "react";
import LoginForm from "./form";

// O formulário lê `?de=` (para onde voltar depois de entrar) com
// `useSearchParams`, que exige um limite de Suspense — sem ele o prerender
// do build falha em /login.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
