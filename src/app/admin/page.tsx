import { redirect } from "next/navigation";
import AdminDashboard from "@/components/admin-dashboard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const instant = false;

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile } = await supabase.from("profiles").select("role,display_name,departments(name)").eq("id", user.id).maybeSingle();
  if (!profile || !["super_admin", "department_admin", "ward_admin", "field_worker", "auditor"].includes(profile.role)) redirect("/admin/login");
  if (profile.role === "field_worker") redirect("/worker");
  const department = Array.isArray(profile.departments) ? profile.departments[0]?.name : (profile.departments as {name?:string}|null)?.name;
  return <AdminDashboard displayName={profile.display_name||user.email||"Municipal staff"} role={profile.role} department={department||"Municipal operations"} />;
}
