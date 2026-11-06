import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({ status: z.enum(["assigned","accepted","in_progress","work_completed","awaiting_verification","verified","closed","reopened"]), note: z.string().trim().min(3).max(500) });
const transitions: Record<string,string[]> = { new:["assigned","reopened"], assigned:["accepted","in_progress","reopened"], accepted:["in_progress","reopened"], in_progress:["work_completed","reopened"], work_completed:["awaiting_verification","in_progress"], awaiting_verification:["verified","closed","reopened"], verified:["closed","reopened"], closed:["reopened"], reopened:["assigned","in_progress"] };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid status and action note are required." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["super_admin","department_admin","ward_admin","field_worker"].includes(profile.role)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const { data: complaint } = await supabase.from("complaints").select("id,status,assigned_to,first_response_at").eq("id", id).maybeSingle();
  if (!complaint) return NextResponse.json({ error: "Complaint not found or outside your assigned scope." }, { status: 404 });
  if (profile.role === "field_worker" && complaint.assigned_to !== user.id) return NextResponse.json({ error: "This complaint is not assigned to you." }, { status: 403 });
  if (!transitions[complaint.status]?.includes(parsed.data.status)) return NextResponse.json({ error: `Status cannot move from ${complaint.status} to ${parsed.data.status}.` }, { status: 409 });
  const updates:Record<string,unknown>={status:parsed.data.status,updated_at:new Date().toISOString()};if(!complaint.first_response_at)updates.first_response_at=new Date().toISOString();
  const { error } = await supabase.from("complaints").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: "Could not update complaint." }, { status: 503 });
  await supabase.from("complaint_status_history").insert({ complaint_id: id, status: parsed.data.status, public_note: parsed.data.note, actor_id: user.id });
  await supabase.from("audit_logs").insert({ actor_id: user.id, action: "complaint.status_changed", entity_type: "complaint", entity_id: id, reason: parsed.data.note, metadata: { from: complaint.status, to: parsed.data.status } });
  return NextResponse.json({ ok: true, status: parsed.data.status });
}
