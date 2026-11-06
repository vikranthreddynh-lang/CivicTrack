import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get("jansetu_demo_role")?.value === "super_admin";

  let client = await createSupabaseServerClient();
  let isAuthorized = false;

  if (client) {
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (profile && ["super_admin", "department_admin", "ward_admin", "field_worker", "auditor"].includes(profile.role)) {
        isAuthorized = true;
      }
    }
  }

  if (!isAuthorized && isDemo) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      client = createClient(url, key, { auth: { persistSession: false } });
      isAuthorized = true;
    }
  }

  if (!isAuthorized || !client) {
    return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
  }

  const [list, total, needs, progress, resolved] = await Promise.all([
    client.from("complaints").select("id,title,category,status,priority,created_at,address_text,ward_id,department_id,assigned_to,jurisdiction_rationale,jurisdiction_evidence,community_impact_score,community_impact_inputs,processing_status,priority_score,ai_confidence,wards(name),departments(name)").order("created_at", { ascending: false }).limit(30),
    client.from("complaints").select("id", { count: "exact", head: true }),
    client.from("complaints").select("id", { count: "exact", head: true }).eq("status", "new"),
    client.from("complaints").select("id", { count: "exact", head: true }).in("status", ["assigned", "accepted", "in_progress", "work_completed", "awaiting_verification"]),
    client.from("complaints").select("id", { count: "exact", head: true }).in("status", ["closed", "verified"]),
  ]);

  if (list.error || total.error || needs.error || progress.error || resolved.error) {
    return NextResponse.json({ error: "Could not load complaints." }, { status: 503 });
  }

  return NextResponse.json({
    complaints: list.data,
    stats: {
      total: total.count ?? 0,
      needs: needs.count ?? 0,
      progress: progress.count ?? 0,
      resolved: resolved.count ?? 0,
    },
  });
}
