import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { consumeRateLimit } from "@/lib/rate-limit";

const schema = z.object({ trackingCode: z.string().regex(/^JS-[A-F0-9]{10}$/i), outcome: z.enum(["confirmed","disputed"]), note: z.string().trim().max(500).default("") });
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try { if (!(await consumeRateLimit(ip, "resident-feedback", 5))) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 }); }
  catch { return NextResponse.json({ error: "Request protection is temporarily unavailable." }, { status: 503 }); }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the tracking code and response." }, { status: 400 });
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if(!url||!key)return NextResponse.json({error:"Resident confirmation requires configured server storage."},{status:503});
  const supabase=createClient(url,key,{auth:{persistSession:false}});
  const hash=createHash("sha256").update(parsed.data.trackingCode.toUpperCase()).digest("hex");
  const {data: complaint}=await supabase.from("complaints").select("id,status").eq("tracking_code_hash",hash).maybeSingle();
  if(!complaint)return NextResponse.json({error:"No complaint was found for that tracking code."},{status:404});
  if(!["work_completed","awaiting_verification","verified"].includes(complaint.status))return NextResponse.json({error:"This complaint is not ready for resident confirmation."},{status:409});
  const {error}=await supabase.from("resident_feedback").insert({complaint_id:complaint.id,outcome:parsed.data.outcome,note:parsed.data.note||null});
  if(error)return NextResponse.json({error:"Could not save your response."},{status:503});
  const nextStatus=parsed.data.outcome==="confirmed"?"closed":"reopened";
  await supabase.from("complaints").update({status:nextStatus,updated_at:new Date().toISOString()}).eq("id",complaint.id);
  await supabase.from("complaint_status_history").insert({complaint_id:complaint.id,status:nextStatus,public_note:parsed.data.outcome==="confirmed"?"Resident confirmed the resolution":"Resident disputed the resolution and requested review"});
  return NextResponse.json({ok:true,status:nextStatus});
}
