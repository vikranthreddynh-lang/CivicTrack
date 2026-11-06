import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Auto-load .env.local if variables are not already set in process environment
const envPath = path.resolve(".env.local");
if (fs.existsSync(envPath)) {
  const envLines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of envLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [k, ...v] = trimmed.split("=");
    if (k && v.length && !process.env[k.trim()]) {
      process.env[k.trim()] = v.join("=").trim();
    }
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_DISPLAY_NAME?.trim() || "Vikranth";

if (!url || !serviceRoleKey || !email || !password) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY), ADMIN_EMAIL, and ADMIN_PASSWORD in the process environment.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: users, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw new Error(`Could not inspect existing users: ${listError.message}`);

const existing = users.users.find((user) => user.email?.toLowerCase() === email);
let user;
if (existing) {
  const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`Could not update the administrator account: ${error.message}`);
  user = data.user;
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) throw new Error(`Could not create the administrator account: ${error.message}`);
  user = data.user;
}

const { error: profileError } = await supabase.from("profiles").upsert({
  id: user.id,
  display_name: displayName,
  role: "super_admin",
}, { onConflict: "id" });
if (profileError) throw new Error(`Auth user exists but admin role provisioning failed: ${profileError.message}`);

console.log(`Administrator account is ready for ${email}. The password was not printed or saved by this script.`);
