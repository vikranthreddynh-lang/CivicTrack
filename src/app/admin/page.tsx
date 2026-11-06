import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import AdminDashboard from "@/components/admin-dashboard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const instant = false;

export default async function AdminPage() {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get("jansetu_demo_role")?.value === "super_admin";

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    if (isDemo) {
      return (
        <AdminDashboard
          displayName="[DEMO] Municipal Administrator"
          role="super_admin"
          department="[DEMO] All Municipal Services"
        />
      );
    }
    redirect("/admin/login");
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (isDemo) {
      return (
        <AdminDashboard
          displayName="[DEMO] Municipal Administrator"
          role="super_admin"
          department="[DEMO] All Municipal Services"
        />
      );
    }
    redirect("/admin/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,display_name,departments(name)")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["super_admin", "department_admin", "ward_admin", "field_worker", "auditor"].includes(profile.role)) {
    if (isDemo) {
      return (
        <AdminDashboard
          displayName="[DEMO] Municipal Administrator"
          role="super_admin"
          department="[DEMO] All Municipal Services"
        />
      );
    }
    redirect("/admin/login");
  }

  if (profile.role === "field_worker") redirect("/worker");

  const department = Array.isArray(profile.departments)
    ? profile.departments[0]?.name
    : (profile.departments as { name?: string } | null)?.name;

  return (
    <AdminDashboard
      displayName={profile.display_name || user.email || "Municipal staff"}
      role={profile.role}
      department={department || "Municipal operations"}
    />
  );
}
