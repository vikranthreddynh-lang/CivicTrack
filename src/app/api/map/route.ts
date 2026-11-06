import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_MAP_COMPLAINTS } from "@/lib/demo-data";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ complaints: DEMO_MAP_COMPLAINTS, isDemo: true });
  }

  try {
    const { data, error } = await supabase.rpc("staff_map_data");
    if (!error && Array.isArray(data) && data.length > 0) {
      // Generalize coordinates slightly (approx ~100m) for public privacy protection
      const generalized = data.map((item: {
        complaint_id: string;
        title: string;
        category: string;
        status: string;
        priority: string;
        latitude: number;
        longitude: number;
        created_at: string;
        ward: string | null;
      }) => ({
        ...item,
        latitude: Number((Math.round(item.latitude * 500) / 500).toFixed(4)),
        longitude: Number((Math.round(item.longitude * 500) / 500).toFixed(4)),
      }));
      return NextResponse.json({ complaints: generalized, isDemo: false });
    }
  } catch {
    // Fallback to demo complaints
  }

  return NextResponse.json({ complaints: DEMO_MAP_COMPLAINTS, isDemo: true });
}
