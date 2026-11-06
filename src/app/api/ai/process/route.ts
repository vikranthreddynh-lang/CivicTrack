import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { calculatePriority } from "@/lib/priority";

export const maxDuration = 60;
const resultSchema = z.object({
  detectedLanguage: z.string().max(80),
  englishTranslation: z.string().max(3000),
  category: z.string().max(80),
  subcategory: z.string().max(80).nullable().optional(),
  severity: z.number().min(0).max(1),
  safetyRisk: z.boolean(),
  confidence: z.number().min(0).max(1),
  suggestedResolution: z.string().max(500),
  originalTranscript: z.string().max(3000).nullable().optional(),
  evidenceSummary: z.string().max(500).nullable().optional(),
});

export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!url || !key || !geminiKey) return NextResponse.json({ error: "Supabase and Gemini server configuration is required." }, { status: 503 });
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: jobs, error: claimError } = await supabase.rpc("claim_ai_processing_jobs", { batch_size: 3 });
  if (claimError) return NextResponse.json({ error: "Could not claim processing jobs." }, { status: 503 });
  let completed = 0;
  for (const job of jobs ?? []) {
    try {
      const { data: complaint, error: complaintError } = await supabase.from("complaints").select("id,title,description,category,address_text,ai_consent,media_consent,community_impact_score").eq("id", job.complaint_id).single();
      if (complaintError || !complaint?.ai_consent) throw new Error("Complaint is unavailable or AI consent is missing.");
      const parts: { text?: string; inline_data?: { mime_type: string; data: string } }[] = [{ text: `You assist a municipal complaint reviewer. Analyze this civic issue. Detect the original language, translate faithfully to English without dropping details, classify into Roads, Water, Drainage, Sanitation, Streetlights, Public safety, or Other, and provide evidence-based guidance. Do not claim an emergency as fact; safetyRisk is a review signal only. Preserve the citizen's original words in originalTranscript if voice is attached. Return only valid JSON matching the requested fields. Title: ${complaint.title}\nDescription: ${complaint.description}\nCitizen category: ${complaint.category}\nLocation text: ${complaint.address_text}\nAttachments: ${complaint.media_consent ? "consented for analysis" : "not consented; ignore all attachments"}` }];
      if (complaint.media_consent) {
        const { data: media } = await supabase.from("complaint_media").select("object_path,mime_type").eq("complaint_id", complaint.id).eq("consented_for_analysis", true).limit(3);
        for (const attachment of media ?? []) {
          // Raw images/video are never sent to a model in this release: automated face/plate
          // redaction is not configured, and originals remain private for staff review.
          if (!attachment.mime_type.startsWith("audio/")) continue;
          const { data: blob, error } = await supabase.storage.from("complaint-originals").download(attachment.object_path);
          if (error || !blob || blob.size > 10_000_000) continue;
          const bytes = Buffer.from(await blob.arrayBuffer()).toString("base64");
          parts.push({ inline_data: { mime_type: attachment.mime_type, data: bytes } });
        }
      }
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL || "gemini-3.5-flash-lite")}:generateContent?key=${encodeURIComponent(geminiKey)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json", temperature: 0.1, responseSchema: { type: "OBJECT", properties: { detectedLanguage: { type: "STRING" }, englishTranslation: { type: "STRING" }, category: { type: "STRING" }, subcategory: { type: "STRING", nullable: true }, severity: { type: "NUMBER" }, safetyRisk: { type: "BOOLEAN" }, confidence: { type: "NUMBER" }, suggestedResolution: { type: "STRING" }, originalTranscript: { type: "STRING", nullable: true }, evidenceSummary: { type: "STRING", nullable: true } }, required: ["detectedLanguage", "englishTranslation", "category", "severity", "safetyRisk", "confidence", "suggestedResolution"] } } }),
      });
      if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}.`);
      const payload = await response.json();
      const raw = payload.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("");
      const parsed = resultSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) throw new Error("Gemini returned an invalid result.");
      const result = parsed.data;
      const normalized = result.englishTranslation || complaint.description;
      const { data: repeatFlag } = await supabase.from("recurrence_flags").select("related_count").eq("complaint_id",complaint.id).maybeSingle();
      const priority=calculatePriority({severity:result.severity,communityImpact:Number(complaint.community_impact_score??0),repeatReports:Number(repeatFlag?.related_count??0),aiSafetySignal:result.safetyRisk});
      const {data:sla}=await supabase.from("sla_policies").select("response_hours,resolution_hours").eq("category",result.category).eq("priority",priority.priority).eq("active",true).maybeSingle();
      const now=Date.now();
      await supabase.from("complaints").update({ ai_language: result.detectedLanguage, ai_translation: normalized, ai_category: result.category, ai_confidence: result.confidence, priority:priority.priority, priority_score: priority.score, priority_reasons:[...priority.reasons,{factor:"ai_confidence",value:result.confidence,reviewRequired:priority.requiresHumanReview}], sla_response_due_at:sla?new Date(now+sla.response_hours*3600000).toISOString():null, sla_resolution_due_at:sla?new Date(now+sla.resolution_hours*3600000).toISOString():null, processing_status: result.confidence < 0.55 ? "manual_review" : "completed", processing_error: null }).eq("id", complaint.id);
      await supabase.from("complaint_transcriptions").insert({ complaint_id: complaint.id, original_text: result.originalTranscript || complaint.description, original_language: result.detectedLanguage, english_translation: normalized });
      await supabase.from("ai_processing_jobs").update({ status: "completed", last_error: null, locked_at: null, updated_at: new Date().toISOString() }).eq("id", job.job_id);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown processing failure.";
      const failed = job.attempts >= 5;
      const waitMs = Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, job.attempts - 1));
      await supabase.from("ai_processing_jobs").update({ status: failed ? "failed" : "retrying", last_error: message, locked_at: null, next_attempt_at: new Date(Date.now() + waitMs).toISOString(), updated_at: new Date().toISOString() }).eq("id", job.job_id);
      await supabase.from("complaints").update({ processing_status: failed ? "failed" : "queued", processing_error: message }).eq("id", job.complaint_id);
    }
  }
  return NextResponse.json({ claimed: jobs?.length ?? 0, completed });
}
