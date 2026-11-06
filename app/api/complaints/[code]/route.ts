import { NextResponse } from "next/server";
import { updateComplaint } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  try {
    const body = await request.json();
    const allowedStatuses = ["Received", "Assigned", "In progress", "Resolved"];
    if (body.status && !allowedStatuses.includes(body.status)) return NextResponse.json({ error: "Unknown complaint status." }, { status: 400 });
    const result = updateComplaint(code, body);
    if (!result) return NextResponse.json({ error: "Complaint not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Could not update this complaint." }, { status: 500 });
  }
}
