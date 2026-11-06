import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/supabase/auth-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const { user, role, supabase } = await getCurrentUserContext();
  if (!supabase || !user) return NextResponse.json({ error: "Sign in as an administrator." }, { status: 401 });
  if (role !== "admin") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to manage email invitations." }, { status: 503 });
  const { data, error } = await admin.from("admin_invitations").select("id,email,status,expires_at,created_at").order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Could not load invitations." }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const { user, role, supabase } = await getCurrentUserContext();
  if (!supabase || !user) return NextResponse.json({ error: "Sign in as an administrator." }, { status: 401 });
  if (role !== "admin") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to send invitations." }, { status: 503 });
  let email: string;
  try { email = String((await request.json()).email ?? "").trim().toLowerCase(); }
  catch { return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 }); }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const { data: invitation, error: inviteRowError } = await admin.from("admin_invitations").insert({ email, invited_by: user.id, status: "pending" }).select("id").single();
  if (inviteRowError) return NextResponse.json({ error: inviteRowError.code === "23505" ? "A pending invitation already exists for this email." : "Could not create the invitation." }, { status: 409 });
  const { error: emailError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${new URL(request.url).origin}/auth/callback?next=/admin/accept-invite` });
  if (emailError) {
    await admin.from("admin_invitations").update({ status: "revoked" }).eq("id", invitation.id);
    return NextResponse.json({ error: "Invitation email could not be sent. Check Supabase SMTP and try again." }, { status: 502 });
  }
  await admin.from("audit_logs").insert({ actor_id: user.id, action: "admin_invitation_created", entity_type: "admin_invitation", entity_id: invitation.id, details: { email } });
  return NextResponse.json({ ok: true, message: `Invitation sent to ${email}.` }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { user, role, supabase } = await getCurrentUserContext();
  if (!supabase || !user) return NextResponse.json({ error: "Sign in as an administrator." }, { status: 401 });
  if (role !== "admin") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to manage invitations." }, { status: 503 });
  let id="";
  try { id=String((await request.json()).id??""); } catch { return NextResponse.json({error:"Invitation id is required."},{status:400}); }
  const { data, error }=await admin.from("admin_invitations").update({status:"revoked"}).eq("id",id).eq("status","pending").select("id").maybeSingle();
  if(error||!data)return NextResponse.json({error:"Pending invitation not found."},{status:404});
  await admin.from("audit_logs").insert({actor_id:user.id,action:"admin_invitation_revoked",entity_type:"admin_invitation",entity_id:id});
  return NextResponse.json({ok:true});
}
