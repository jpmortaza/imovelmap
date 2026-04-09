import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireSuperAdmin() {
  const user = await requireUser();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("corretores")
    .select("role, nome")
    .eq("id", user.id)
    .single();
  if (error || data?.role !== "super_admin") {
    redirect("/imoveis");
  }
  return { user, corretor: data };
}
