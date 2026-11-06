import { NextResponse } from "next/server";
import { addComplaint, listComplaints } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(listComplaints());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const required = ["title", "description", "category", "department", "location"];
    if (required.some(key => typeof body[key] !== "string" || !body[key].trim()) || !Number.isFinite(body.lat) || !Number.isFinite(body.lng)) {
      return NextResponse.json({ error: "Add a clear description and a location to continue." }, { status: 400 });
    }
    const result = addComplaint({ ...body, reporter: body.reporter || "Resident" });
    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not save this complaint." }, { status: 500 });
  }
}
