import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate demo credentials
    if (
      (email === "demo.admin@jansetu.gov" || email === "admin@jansetu.gov") &&
      (password === "JanSetuDemo@2026" || password === "JanSetuAdmin2026!")
    ) {
      const cookieStore = await cookies();
      cookieStore.set("jansetu_demo_role", "super_admin", {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return NextResponse.json({ ok: true, role: "super_admin" });
    }

    return NextResponse.json({ error: "Invalid demo credentials." }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
}
