import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { consumeRateLimit } from "@/lib/rate-limit";
import { trackingCodePattern } from "@/lib/complaint-validation";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try { if (!(await consumeRateLimit(ip, "public-track", 12))) return NextResponse.json({ error: "Too many lookups. Please wait a minute and try again." }, { status: 429 }); }
  catch { return NextResponse.json({ error: "Tracking protection is temporarily unavailable." }, { status: 503 }); }
  const body = await request.json().catch(() => null);
  const code=typeof body?.trackingCode==="string"?body.trackingCode.trim():"";
  if (!trackingCodePattern.test(code)) return NextResponse.json({ error: "Enter a valid JanSetu tracking code." }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) return NextResponse.json({ error: "Tracking is unavailable in demo mode. Configure Supabase to enable secure public tracking." }, { status: 503 });
  const hash = createHash("sha256").update(code.toUpperCase()).digest("hex");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("public_track_complaint", { code_hash: hash });
  if (error) return NextResponse.json({ error: "Tracking is temporarily unavailable." }, { status: 503 });
  if (!data) return NextResponse.json({ error: "No complaint was found for that tracking code." }, { status: 404 });
  return NextResponse.json({ complaint: { ...data, trackingCode: code.toUpperCase() } });
}
