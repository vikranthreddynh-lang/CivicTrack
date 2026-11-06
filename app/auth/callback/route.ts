import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/resident";
  const destination = next.startsWith("/") && !next.startsWith("//") ? next : "/resident";
  const supabase = await createSupabaseServerClient();
  if (!supabase || (!code && !tokenHash)) return NextResponse.redirect(new URL("/login?error=callback", url.origin));
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash:tokenHash!, type:otpType??"email" });
  if (error) return NextResponse.redirect(new URL("/login?error=callback", url.origin));

  if (destination === "/admin/accept-invite") {
    const { data: { user } } = await supabase.auth.getUser();
    const admin = createSupabaseAdminClient();
    if (user?.email && admin) {
      const { data: invitation } = await admin.from("admin_invitations").select("id,email").eq("status", "pending").eq("email", user.email.toLowerCase()).gt("expires_at", new Date().toISOString()).maybeSingle();
      if (invitation) {
        const { error: roleError } = await admin.from("user_roles").upsert({ user_id: user.id, role: "admin" });
        if (roleError) return NextResponse.redirect(new URL("/admin/login?error=invitation", url.origin));
        const { data: accepted } = await admin.from("admin_invitations").update({ status: "accepted", accepted_by: user.id }).eq("id", invitation.id).eq("status", "pending").select("id").maybeSingle();
        if (!accepted) return NextResponse.redirect(new URL("/admin/login?error=invitation", url.origin));
        await admin.from("audit_logs").insert({ actor_id: user.id, action: "admin_invitation_accepted", entity_type: "admin_invitation", entity_id: invitation.id });
        return NextResponse.redirect(new URL("/admin", url.origin));
      }
    }
    return NextResponse.redirect(new URL("/admin/login?error=invitation", url.origin));
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}
