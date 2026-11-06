import { redirect } from "next/navigation";
import JanSetuApp from "@/app/poya-app";
import { getCurrentUserContext } from "@/lib/supabase/auth-context";

export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const { user, role, supabase } = await getCurrentUserContext();
  if (!supabase || !user) redirect("/admin/login");
  if (role !== "admin") redirect("/resident");
  return <JanSetuApp adminEmail={user.email ?? "Administrator"}/>;
}
