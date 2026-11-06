import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_MAP_COMPLAINTS } from "@/lib/demo-data";

export async function GET() {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get("jansetu_demo_role")?.value === "super_admin";

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    if (isDemo) {
      return NextResponse.json({ complaints: DEMO_MAP_COMPLAINTS, isDemo: true });
    }
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (isDemo) {
      return NextResponse.json({ complaints: DEMO_MAP_COMPLAINTS, isDemo: true });
    }
    return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile) {
    if (isDemo) {
      return NextResponse.json({ complaints: DEMO_MAP_COMPLAINTS, isDemo: true });
    }
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("staff_map_data");
  if (error || !data || data.length === 0) {
    return NextResponse.json({ complaints: DEMO_MAP_COMPLAINTS, isDemo: true });
  }
  return NextResponse.json({ complaints: data, isDemo: false });
}
