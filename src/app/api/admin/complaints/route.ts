import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["super_admin", "department_admin", "ward_admin", "field_worker", "auditor"].includes(profile.role)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const [list,total,needs,progress,resolved] = await Promise.all([
    supabase.from("complaints").select("id,title,category,status,priority,created_at,address_text,ward_id,department_id,assigned_to,jurisdiction_rationale,jurisdiction_evidence,community_impact_score,community_impact_inputs,processing_status,priority_score,ai_confidence,wards(name),departments(name)").order("created_at", { ascending: false }).limit(30),
    supabase.from("complaints").select("id",{count:"exact",head:true}),
    supabase.from("complaints").select("id",{count:"exact",head:true}).eq("status","new"),
    supabase.from("complaints").select("id",{count:"exact",head:true}).in("status",["assigned","accepted","in_progress","work_completed","awaiting_verification"]),
    supabase.from("complaints").select("id",{count:"exact",head:true}).in("status",["closed","verified"]),
  ]);
  if (list.error || total.error || needs.error || progress.error || resolved.error) return NextResponse.json({ error: "Could not load complaints." }, { status: 503 });
  return NextResponse.json({ complaints: list.data, stats:{total:total.count??0,needs:needs.count??0,progress:progress.count??0,resolved:resolved.count??0} });
}
