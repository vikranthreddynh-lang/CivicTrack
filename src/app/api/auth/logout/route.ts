import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore if signout fails
    }
  }
  const cookieStore = await cookies();
  cookieStore.delete("jansetu_demo_role");
  return NextResponse.json({ ok: true });
}
