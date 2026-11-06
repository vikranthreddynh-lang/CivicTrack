import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length < 3) return NextResponse.json({ error: "Enter a more specific address." }, { status: 400 });
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2"); url.searchParams.set("limit", "1"); url.searchParams.set("q", query);
    const response = await fetch(url, { headers: { "User-Agent": "JanSetuCivicDemo/1.0 (local hackathon prototype)" }, next: { revalidate: 0 } });
    if (!response.ok) return NextResponse.json({ error: "Map search is unavailable. You can still submit the address." }, { status: 502 });
    const results = await response.json();
    if (!results.length) return NextResponse.json({ error: "No map pin found. Try a nearby landmark or use your current location." }, { status: 404 });
    return NextResponse.json({ lat: Number(results[0].lat), lng: Number(results[0].lon), label: results[0].display_name });
  } catch {
    return NextResponse.json({ error: "Map search is unavailable. You can still submit the address." }, { status: 502 });
  }
}
