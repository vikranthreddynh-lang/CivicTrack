import fs from "fs";
import path from "path";

const projectRef = "olxzmzeanavbybqcucob";
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

async function runQuery(query, description) {
  console.log(`Applying: ${description}...`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to apply ${description}: ${JSON.stringify(body)}`);
  }
  console.log(`✓ Succeeded: ${description}`);
  return body;
}

async function getApiKeys() {
  console.log("Fetching API keys from Supabase Management API...");
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Could not fetch API keys: ${res.statusText}`);
  const keys = await res.json();
  const anonKey = keys.find(k => k.name === "anon")?.api_key || keys[0]?.api_key;
  const serviceKey = keys.find(k => k.name === "service_role")?.api_key;
  return { anonKey, serviceKey };
}

async function main() {
  // 1. Fetch keys
  const { anonKey, serviceKey } = await getApiKeys();
  if (!anonKey || !serviceKey) {
    throw new Error("Could not retrieve anon and service_role keys.");
  }
  console.log("✓ Retrieved anon key and service_role key.");

  // 2. Read migration files
  const baseDir = path.resolve(".");
  const mig1 = fs.readFileSync(path.join(baseDir, "supabase/migrations/202611060001_initial.sql"), "utf-8");
  const mig2 = fs.readFileSync(path.join(baseDir, "supabase/migrations/202611060002_intelligence_and_access.sql"), "utf-8");
  const mig3 = fs.readFileSync(path.join(baseDir, "supabase/migrations/202611060003_staff_map.sql"), "utf-8");

  // 3. Apply migrations in order
  await runQuery(mig1, "Migration 1: 202611060001_initial.sql");
  await runQuery(mig2, "Migration 2: 202611060002_intelligence_and_access.sql");
  await runQuery(mig3, "Migration 3: 202611060003_staff_map.sql");

  // 4. Verify
  const verifyRes = await runQuery("select to_regclass('public.complaints') as tablename;", "Verify public.complaints exists");
  console.log("Verification result:", verifyRes);

  // 5. Update .env.local safely
  const envContent = [
    `NEXT_PUBLIC_SUPABASE_URL=https://${projectRef}.supabase.co`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${anonKey}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
    `SUPABASE_SECRET_KEY=${serviceKey}`,
    `CRON_SECRET=467183b9124c984a8c1a6198fa0687422ff20ca894083da835c7260e81706545`,
    `RATE_LIMIT_SALT=86bf06b84707e5d040ee0439a35a43f7ccc691013546c6af86e15096655bdda8`,
    `NEXT_PUBLIC_APP_URL=http://localhost:3000`,
  ].join("\n") + "\n";

  fs.writeFileSync(path.join(baseDir, ".env.local"), envContent, "utf-8");
  console.log("✓ Successfully configured .env.local with live Supabase credentials (gitignored).");
}

main().catch(e => {
  console.error("Migration error:", e.message || e);
  process.exit(1);
});
