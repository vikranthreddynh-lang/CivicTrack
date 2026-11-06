import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { consumeRateLimit } from "@/lib/rate-limit";
import { reportSchema } from "@/lib/complaint-validation";

function safeCode() { return `JS-${randomBytes(5).toString("hex").toUpperCase()}`; }
function hashCode(code: string) { return createHash("sha256").update(code.toUpperCase()).digest("hex"); }
function spamSignal(title: string, text: string) {
  const body = `${title} ${text}`;
  const repeated = /(.)\1{9,}/i.test(body) ? 0.35 : 0;
  const links = (body.match(/https?:\/\//gi) ?? []).length > 2 ? 0.35 : 0;
  const caps = body.length > 50 && (body.match(/[A-Z]/g)?.length ?? 0) / body.length > 0.7 ? 0.3 : 0;
  return Math.min(1, repeated + links + caps);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try { if (!(await consumeRateLimit(ip, "complaint-submit", 5))) return NextResponse.json({ error: "Too many reports. Please try again in a minute." }, { status: 429 }); }
  catch { return NextResponse.json({ error: "Submission protection is temporarily unavailable." }, { status: 503 }); }
  let body: unknown;
  let files: File[] = [];
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      body = JSON.parse(String(form.get("report") ?? "{}"));
      files = form.getAll("files").filter((file): file is File => file instanceof File);
    } else body = await request.json();
  } catch { body = null; }
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    const hints: string[] = [];
    if (fe.title) hints.push("Title must be 4\u2013120 characters");
    if (fe.description) hints.push("Description must be 8\u20132000 characters");
    if (fe.address) hints.push("Address must be 3\u2013300 characters");
    if (fe.category) hints.push("Choose a valid category");
    if (fe.aiConsent || fe.mediaConsent) hints.push("Consent fields are required");
    const msg = hints.length ? hints.join(". ") + "." : "Please review the report details and try again.";
    return NextResponse.json({ error: msg, details: fe }, { status: 400 });
  }
  const data = parsed.data;
  const supportedTypes=["image/jpeg","image/png","image/webp","video/mp4","audio/webm","audio/mpeg","audio/mp4","audio/wav"];
  if (files.length > 5 || files.some(file => file.size > 10_000_000 || !supportedTypes.includes(file.type.split(";")[0]))) return NextResponse.json({ error: "Choose up to 5 supported files under 10 MB each." }, { status: 400 });
  if (!data.aiConsent && data.mediaConsent) return NextResponse.json({ error: "Media analysis consent requires consent to AI processing." }, { status: 400 });
  const trackingCode = safeCode();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ trackingCode, mode: "demo", message: "Demo mode: this report is not saved to a municipal database." });

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data: complaint, error } = await supabase.from("complaints").insert({
    tracking_code_hash: hashCode(trackingCode), title: data.title, description: data.description,
    category: data.category, address_text: data.address,
    location: data.coordinates ? `SRID=4326;POINT(${data.coordinates.lng} ${data.coordinates.lat})` : null,
    ai_consent: data.aiConsent, media_consent: data.mediaConsent,
    status: "new", priority: "p3", processing_status: data.aiConsent ? "queued" : "manual_review",
    source: "resident_web", spam_score: spamSignal(data.title, data.description),
  }).select("id").single();
  if (error || !complaint) return NextResponse.json({ error: "Report could not be saved. Please retry shortly." }, { status: 503 });
  const {data:sla}=await supabase.from("sla_policies").select("assignment_hours,response_hours,resolution_hours").eq("category",data.category).eq("priority","p3").eq("active",true).maybeSingle();
  if(sla){const start=Date.now();await supabase.from("complaints").update({sla_assignment_due_at:new Date(start+sla.assignment_hours*3600000).toISOString(),sla_response_due_at:new Date(start+sla.response_hours*3600000).toISOString(),sla_resolution_due_at:new Date(start+sla.resolution_hours*3600000).toISOString()}).eq("id",complaint.id);}
  if (files.length) {
    for (const file of files) {
      const objectPath = `${complaint.id}/${randomBytes(12).toString("hex")}`;
      const mimeType=file.type.split(";")[0];
      const { error: uploadError } = await supabase.storage.from("complaint-originals").upload(objectPath, file, { contentType: mimeType, upsert: false });
      if (uploadError) return NextResponse.json({ error: "Report was saved, but a media upload failed. Please retry the upload from the tracking page.", trackingCode }, { status: 201 });
      const { error: mediaError } = await supabase.from("complaint_media").insert({ complaint_id: complaint.id, original_name: file.name, object_path: objectPath, mime_type: mimeType, byte_size: file.size, consented_for_analysis: data.mediaConsent && mimeType.startsWith("audio/"), processing_status: data.mediaConsent && mimeType.startsWith("audio/") ? "queued" : "stored" });
      if (mediaError) return NextResponse.json({ error: "Report was saved, but its media record could not be added.", trackingCode }, { status: 201 });
    }
  }
  if (data.coordinates) {
    const { lat, lng } = data.coordinates;
    const { data: jurisdictionData } = await supabase.rpc("resolve_jurisdiction", { p_lat: lat, p_lng: lng, p_category: data.category }).maybeSingle();
    const jurisdiction = jurisdictionData as { ward_id:string; department_id:string; rationale:string; evidence:Record<string,unknown> } | null;
    if (jurisdiction) await supabase.from("complaints").update({ ward_id: jurisdiction.ward_id, department_id: jurisdiction.department_id, jurisdiction_rationale: jurisdiction.rationale, jurisdiction_evidence: jurisdiction.evidence, jurisdiction_confidence: 1 }).eq("id", complaint.id);
    const { data: impact } = await supabase.rpc("calculate_community_impact", { p_lat: lat, p_lng: lng });
    if (impact) await supabase.from("complaints").update({ community_impact_score: impact.score, community_impact_inputs: impact }).eq("id", complaint.id);
    const { data: recurrence } = await supabase.rpc("find_recurring_complaints", { p_complaint_id: complaint.id, p_radius_m: 300, p_window_days: 90 });
    const related = Number(recurrence?.related_count ?? 0);
    if (related >= 2) {
      await supabase.from("recurrence_flags").upsert({ complaint_id: complaint.id, related_count: related, radius_m: 300, window_days: 90, explanation: `${related} prior reports in the same category within 300 meters during the last 90 days. Review before treating as one issue.` }, { onConflict: "complaint_id" });
      await supabase.from("complaints").update({ repeat_cluster_id: complaint.id }).eq("id", complaint.id);
    }
  }
  await supabase.from("complaint_status_history").insert({ complaint_id: complaint.id, status: "new", public_note: "Report received" });
  return NextResponse.json({ trackingCode, mode: "live" }, { status: 201 });
}
