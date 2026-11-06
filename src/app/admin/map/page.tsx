import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import LiveMap from "@/components/live-map";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const instant = false;

export default async function AdminMapPage() {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get("jansetu_demo_role")?.value === "super_admin";

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    if (isDemo) return <LiveMap />;
    redirect("/admin/login");
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (isDemo) return <LiveMap />;
    redirect("/admin/login");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile) {
    if (isDemo) return <LiveMap />;
    redirect("/admin/login");
  }

  return <LiveMap />;
}
