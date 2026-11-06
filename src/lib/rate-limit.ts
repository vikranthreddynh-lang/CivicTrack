import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const localBuckets = new Map<string, { count: number; reset: number }>();

export async function consumeRateLimit(ip: string, action: string, limit: number, windowSeconds = 60) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (url && key) {
    const salt = process.env.RATE_LIMIT_SALT || process.env.CRON_SECRET;
    if (!salt) throw new Error("RATE_LIMIT_SALT or CRON_SECRET must be configured.");
    const keyHash = createHash("sha256").update(`${salt}:${action}:${ip}`).digest("hex");
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await supabase.rpc("consume_api_rate_limit", { p_key_hash: keyHash, p_limit: limit, p_window_seconds: windowSeconds });
    if (error) throw new Error("Rate limiting is unavailable.");
    return Boolean(data);
  }
  const now = Date.now();
  const id = `${action}:${ip}`;
  const current = localBuckets.get(id);
  if (!current || current.reset <= now) { localBuckets.set(id, { count: 1, reset: now + windowSeconds * 1000 }); return true; }
  current.count += 1;
  return current.count <= limit;
}
