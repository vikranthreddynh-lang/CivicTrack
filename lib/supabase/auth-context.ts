import "server-only";
import { createSupabaseServerClient } from "./server";

export async function getCurrentUserContext() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { supabase: null, user: null, role: null } as const;
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase, user: null, role: null } as const;
  const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
  return { supabase, user, role: roleRow?.role === "admin" ? "admin" as const : "resident" as const };
}
