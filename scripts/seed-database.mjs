import fs from "fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function getEnvConfig() {
  const envContent = fs.readFileSync(".env.local", "utf8");
  const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/);
  const keyMatch = envContent.match(/SUPABASE_SECRET_KEY=([^\r\n]+)/) || envContent.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/);
  if (!urlMatch || !keyMatch) {
    throw new Error("Could not find Supabase URL and service key in .env.local");
  }
  return { url: urlMatch[1].trim(), key: keyMatch[1].trim() };
}

function hashCode(code) {
  return createHash("sha256").update(code.toUpperCase()).digest("hex");
}

async function main() {
  const { url, key } = getEnvConfig();
  console.log("Connecting to Supabase at:", url);
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // 1. Departments
  const departments = [
    { name: "[DEMO] Roads" },
    { name: "[DEMO] Water" },
    { name: "[DEMO] Drainage" },
    { name: "[DEMO] Sanitation" },
    { name: "[DEMO] Streetlights" },
    { name: "[DEMO] Public safety" },
  ];
  console.log("Seeding departments...");
  for (const dept of departments) {
    const { error } = await supabase.from("departments").upsert(dept, { onConflict: "name" });
    if (error) console.warn("Dept error:", dept.name, error.message);
  }
  const { data: deptRows } = await supabase.from("departments").select("id, name");
  const deptMap = Object.fromEntries((deptRows || []).map(d => [d.name.replace("[DEMO] ", ""), d.id]));

  // 2. Wards
  console.log("Seeding wards...");
  const wards = [
    {
      name: "[DEMO] Central Ward",
      ward_code: "DEMO-01",
      municipality: "[DEMO] JanSetu City",
      boundary: "SRID=4326;MULTIPOLYGON(((77.58 12.96,77.62 12.96,77.62 12.99,77.58 12.99,77.58 12.96)))",
    },
    {
      name: "[DEMO] South Ward",
      ward_code: "DEMO-02",
      municipality: "[DEMO] JanSetu City",
      boundary: "SRID=4326;MULTIPOLYGON(((77.57 12.91,77.61 12.91,77.61 12.95,77.57 12.95,77.57 12.91)))",
    },
    {
      name: "[DEMO] East Ward",
      ward_code: "DEMO-03",
      municipality: "[DEMO] JanSetu City",
      boundary: "SRID=4326;MULTIPOLYGON(((77.62 12.95,77.66 12.95,77.66 12.98,77.62 12.98,77.62 12.95)))",
    },
  ];
  for (const ward of wards) {
    const { error } = await supabase.from("wards").upsert(ward, { onConflict: "ward_code" });
    if (error) console.warn("Ward error:", ward.ward_code, error.message);
  }
  const { data: wardRows } = await supabase.from("wards").select("id, name, ward_code");
  const wardMap = Object.fromEntries((wardRows || []).map(w => [w.ward_code, w.id]));

  // 3. SLA Policies
  console.log("Seeding SLA policies...");
  const categories = ["Roads", "Water", "Drainage", "Sanitation", "Streetlights", "Public safety", "Other"];
  const priorities = ["p0", "p1", "p2", "p3"];
  for (const cat of categories) {
    for (const p of priorities) {
      const assignmentHours = p === "p0" ? 1 : p === "p1" ? 4 : p === "p2" ? 24 : 72;
      const responseHours = p === "p0" ? 1 : p === "p1" ? 4 : p === "p2" ? 12 : 24;
      const resolutionHours = p === "p0" ? 4 : p === "p1" ? 24 : p === "p2" ? 72 : 168;
      await supabase.from("sla_policies").upsert(
        { category: cat, priority: p, assignment_hours: assignmentHours, response_hours: responseHours, resolution_hours: resolutionHours },
        { onConflict: "category,priority" }
      );
    }
  }

  // 4. Sample Complaints with varied statuses
  const demoReports = [
    {
      code: "JS-A1B2C3D4E5",
      title: "[DEMO] Large pothole near metro station entrance",
      description: "Deep pothole forming hazardous obstacle on 12th Main Road adjacent to the metro entry point. Two-wheelers are losing balance.",
      category: "Roads",
      address: "[DEMO] 12th Main Rd, Metro Gate 2, Central Ward",
      ward_code: "DEMO-01",
      lat: 12.9732,
      lng: 77.5964,
      status: "new",
      priority: "p2",
      community_impact_score: 74.5,
      history: [
        { status: "new", public_note: "Report received via resident portal. Automated triage initiated." }
      ]
    },
    {
      code: "JS-B2C3D4E5F6",
      title: "[DEMO] Major potable water pipeline leak",
      description: "Continuous gush of drinking water flowing down the street from cracked 6-inch underground distribution pipe.",
      category: "Water",
      address: "[DEMO] 4th Cross Road, Lakeview Sector, Central Ward",
      ward_code: "DEMO-01",
      lat: 12.9785,
      lng: 77.6012,
      status: "assigned",
      priority: "p1",
      community_impact_score: 88.0,
      history: [
        { status: "new", public_note: "Report received and verified by system triage." },
        { status: "assigned", public_note: "Dispatched to Central Water Works rapid intervention crew." }
      ]
    },
    {
      code: "JS-C3D4E5F6A1",
      title: "[DEMO] Faulty streetlights creating dark zone near school",
      description: "Four consecutive LED street poles dark along the pedestrian walkway leading to the government secondary school.",
      category: "Streetlights",
      address: "[DEMO] School Cross Road, South Ward",
      ward_code: "DEMO-02",
      lat: 12.9340,
      lng: 77.5850,
      status: "in_progress",
      priority: "p2",
      community_impact_score: 62.0,
      history: [
        { status: "new", public_note: "Report received." },
        { status: "assigned", public_note: "Work ticket assigned to Southern Electrical Zone team." },
        { status: "in_progress", public_note: "Linemen on site replacing damaged photocell and wiring." }
      ]
    },
    {
      code: "JS-D4E5F6A1B2",
      title: "[DEMO] Blocked stormwater drain overflowing onto road",
      description: "Silt and urban debris have clogged the primary monsoon drain grating, causing water stagnation across two traffic lanes.",
      category: "Drainage",
      address: "[DEMO] 80ft Canal Road, Central Ward",
      ward_code: "DEMO-01",
      lat: 12.9710,
      lng: 77.5920,
      status: "work_completed",
      priority: "p1",
      community_impact_score: 82.5,
      history: [
        { status: "new", public_note: "High priority drainage report logged." },
        { status: "assigned", public_note: "Emergency desilting crew assigned with suction unit." },
        { status: "in_progress", public_note: "Suction and excavation work ongoing along 80m stretch." },
        { status: "work_completed", public_note: "Blockage cleared, culvert flow restored. Site photo attached to case record." }
      ]
    },
    {
      code: "JS-E5F6A1B2C3",
      title: "[DEMO] Community garbage dump cleared and sanitized",
      description: "Open accumulation of commercial vegetable waste on corner plot cleared by municipal sanitation team.",
      category: "Sanitation",
      address: "[DEMO] Market Cross, East Ward",
      ward_code: "DEMO-03",
      lat: 12.9650,
      lng: 77.6350,
      status: "verified",
      priority: "p3",
      community_impact_score: 45.0,
      history: [
        { status: "new", public_note: "Sanitation complaint received." },
        { status: "assigned", public_note: "Assigned to East Division Waste Management squad." },
        { status: "in_progress", public_note: "Compactor vehicle and cleaning workers deployed." },
        { status: "work_completed", public_note: "Waste cleared and area treated with lime powder." },
        { status: "verified", public_note: "Inspected and approved by Ward Sanitation Inspector." }
      ]
    },
    {
      code: "JS-F6A1B2C3D4",
      title: "[DEMO] Broken footpath pavers repaired",
      description: "Uneven concrete pavers on the commercial walkway were reset and mortar fixed to prevent trip hazards.",
      category: "Roads",
      address: "[DEMO] Commercial Boulevard, South Ward",
      ward_code: "DEMO-02",
      lat: 12.9280,
      lng: 77.5810,
      status: "closed",
      priority: "p3",
      community_impact_score: 51.0,
      history: [
        { status: "new", public_note: "Footpath defect report submitted." },
        { status: "assigned", public_note: "Civil works division notified." },
        { status: "in_progress", public_note: "Contractor resetting foundation and interlock tiles." },
        { status: "work_completed", public_note: "Repair work completed." },
        { status: "closed", public_note: "Resident confirmed satisfactory repair via tracking portal." }
      ]
    },
    {
      code: "JS-1A2B3C4D5E",
      title: "[DEMO] Low domestic water pressure during peak hours",
      description: "Residences in blocks 4 through 8 receiving intermittent low pressure during 6am-9am supply cycle.",
      category: "Water",
      address: "[DEMO] Residential Sector 7, East Ward",
      ward_code: "DEMO-03",
      lat: 12.9620,
      lng: 77.6410,
      status: "accepted",
      priority: "p2",
      community_impact_score: 68.0,
      history: [
        { status: "new", public_note: "Water supply anomaly logged." },
        { status: "assigned", public_note: "Forwarded to East Water Pressure Monitoring station." },
        { status: "accepted", public_note: "Assistant Executive Engineer accepted task; valve audit scheduled for next supply cycle." }
      ]
    },
    {
      code: "JS-2B3C4D5E6F",
      title: "[DEMO] Sparking distribution box adjacent to children playground",
      description: "Sparks and audible humming observed from electrical feeder pillar box located outside municipal park gate.",
      category: "Public safety",
      address: "[DEMO] Children Park Perimeter Road, Central Ward",
      ward_code: "DEMO-01",
      lat: 12.9750,
      lng: 77.5990,
      status: "in_progress",
      priority: "p0",
      community_impact_score: 95.0,
      history: [
        { status: "new", public_note: "Emergency public safety hazard flagged with P0 priority." },
        { status: "assigned", public_note: "Dispatched emergency electrical safety unit." },
        { status: "in_progress", public_note: "Area cordoned off. Power isolated to feeder pillar for urgent busbar repair." }
      ]
    }
  ];

  console.log(`Seeding ${demoReports.length} complaints with varied statuses...`);
  for (const report of demoReports) {
    const hash = hashCode(report.code);
    const wardId = wardMap[report.ward_code];
    const deptId = deptMap[report.category];

    // Check if complaint already exists
    const { data: existing } = await supabase
      .from("complaints")
      .select("id")
      .eq("tracking_code_hash", hash)
      .maybeSingle();

    let complaintId = existing?.id;

    if (!complaintId) {
      const { data: inserted, error: insertErr } = await supabase
        .from("complaints")
        .insert({
          tracking_code_hash: hash,
          title: report.title,
          description: report.description,
          category: report.category,
          address_text: report.address,
          location: `SRID=4326;POINT(${report.lng} ${report.lat})`,
          ward_id: wardId,
          department_id: deptId,
          status: report.status,
          priority: report.priority,
          community_impact_score: report.community_impact_score,
          ai_consent: false,
          media_consent: false,
          processing_status: "manual_review",
          source: "local_seed",
          jurisdiction_rationale: "Assigned by municipal geographic boundary rules.",
          jurisdiction_evidence: { source: "JanSetu Ward Registry", confidence: 1.0 },
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error("Failed to insert complaint:", report.code, insertErr.message);
        continue;
      }
      complaintId = inserted.id;
      console.log(`✓ Inserted ${report.code} (${report.status}): ${report.title}`);
    } else {
      // Update status to ensure it has the intended status
      await supabase
        .from("complaints")
        .update({
          status: report.status,
          priority: report.priority,
          ward_id: wardId,
          department_id: deptId,
        })
        .eq("id", complaintId);
      console.log(`✓ Updated existing ${report.code} to status ${report.status}`);
    }

    // Insert history timeline
    if (complaintId && report.history?.length) {
      // Clear old history to avoid duplicate runs
      await supabase.from("complaint_status_history").delete().eq("complaint_id", complaintId);
      const baseTime = Date.now() - (report.history.length * 3600000);
      for (let i = 0; i < report.history.length; i++) {
        const item = report.history[i];
        const stepTime = new Date(baseTime + (i * 3600000)).toISOString();
        await supabase.from("complaint_status_history").insert({
          complaint_id: complaintId,
          status: item.status,
          public_note: item.public_note,
          created_at: stepTime,
        });
      }
    }
  }

  console.log("\n✅ Database seeding complete!");
}

main().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
