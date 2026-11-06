import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["super_admin", "department_admin"].includes(profile.role)) return NextResponse.json({ error: "Only municipal administrators can retry AI processing." }, { status: 403 });
  const { data: job } = await supabase.from("ai_processing_jobs").select("id,complaint_id").eq("id", id).maybeSingle();
  if (!job) return NextResponse.json({ error: "Processing job not found or outside your access." }, { status: 404 });
  const { data: complaint } = await supabase.from("complaints").select("id,ai_consent").eq("id", job.complaint_id).maybeSingle();
  if (!complaint) return NextResponse.json({ error: "Complaint is outside your access." }, { status: 404 });
  if (!complaint.ai_consent) return NextResponse.json({ error: "AI consent was not provided for this complaint." }, { status: 409 });
  const { error } = await supabase.from("ai_processing_jobs").update({ status: "queued", attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null, locked_at: null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: "Could not queue a retry." }, { status: 503 });
  await supabase.from("complaints").update({ processing_status: "queued", processing_error: null }).eq("id", complaint.id);
  return NextResponse.json({ ok: true });
}
