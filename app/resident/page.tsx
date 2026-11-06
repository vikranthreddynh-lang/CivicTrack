import { redirect } from "next/navigation";
import ResidentDashboard from "./resident-dashboard";
import { getCurrentUserContext } from "@/lib/supabase/auth-context";

export const dynamic = "force-dynamic";
export default async function ResidentPage() {
  const { user, role, supabase } = await getCurrentUserContext();
  if (!supabase || !user) redirect("/login");
  if (role === "admin") redirect("/admin");
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  return <ResidentDashboard name={profile?.full_name || user.email || "Resident"}/>;
}
