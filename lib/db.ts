import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export type Complaint = {
  id: number;
  code: string;
  title: string;
  description: string;
  category: string;
  department: string;
  status: string;
  priority: string;
  location: string;
  lat: number;
  lng: number;
  created_at: string;
  updated_at: string;
  reporter: string;
  updates: string;
  evidence: string | null;
  resident_feedback: string | null;
  signal_id: string | null;
};

const dataDir = path.join(process.cwd(), "data");
let connection: DatabaseSync | null = null;

function getDatabase(): DatabaseSync {
  if (connection) return connection;
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "poya.sqlite"));
  db.exec("PRAGMA busy_timeout = 10000;");
  db.exec(`
  CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    department TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Received',
    priority TEXT NOT NULL DEFAULT 'Normal',
    location TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    reporter TEXT NOT NULL DEFAULT 'Resident',
    updates TEXT NOT NULL DEFAULT '[]',
    evidence TEXT,
    resident_feedback TEXT,
    signal_id TEXT
  );
`);

  const count = db.prepare("SELECT COUNT(*) AS n FROM complaints").get() as { n: number };
  if (count.n === 0) {
    const now = Date.now();
    const samples = [
    { code:"PY-2048", title:"Pothole growing near the bus stop", description:"A deep pothole is forcing two-wheelers into traffic near the bus stop.", category:"Roads", department:"Roads & Mobility", status:"In progress", priority:"High", location:"Market Street, Ward 04", lat:12.976, lng:77.601, age:5, reporter:"Ananya R.", signal:"SIG-04A" },
    { code:"PY-2051", title:"Overflowing public bin", description:"The corner bin has been full since yesterday and waste is on the footpath.", category:"Waste", department:"Sanitation", status:"Assigned", priority:"Normal", location:"Lakeview Park Gate", lat:12.973, lng:77.598, age:42, reporter:"Kiran M.", signal:null },
    { code:"PY-2053", title:"Water leaking from roadside pipe", description:"A steady stream is pooling along the curb. The road is becoming slippery.", category:"Water", department:"Water Works", status:"Received", priority:"High", location:"2nd Cross, Ward 04", lat:12.979, lng:77.605, age:93, reporter:"Anonymous", signal:"SIG-04B" },
    { code:"PY-2056", title:"Streetlight out on walking path", description:"Three lights on the park path are not working after dark.", category:"Streetlights", department:"Electrical Services", status:"Resolved", priority:"Normal", location:"Riverside Walkway", lat:12.968, lng:77.591, age:360, reporter:"Dev S.", signal:null, evidence:"Repair crew replaced the fuse and tested the lights at dusk.", feedback:"fixed" },
    { code:"PY-2060", title:"Pothole at the market crossing", description:"Vehicles are swerving around a pothole just before the crossing.", category:"Roads", department:"Roads & Mobility", status:"In progress", priority:"High", location:"Market Street, Ward 04", lat:12.9764, lng:77.6012, age:11, reporter:"Meera P.", signal:"SIG-04A" },
    { code:"PY-2062", title:"Low water pressure this morning", description:"Water pressure has dropped across our lane since 6am.", category:"Water", department:"Water Works", status:"Received", priority:"Normal", location:"Garden Lane, Ward 02", lat:12.984, lng:77.587, age:1560, reporter:"Rohit N.", signal:null }
    ];
    const insert = db.prepare(`INSERT INTO complaints
    (code,title,description,category,department,status,priority,location,lat,lng,created_at,updated_at,reporter,updates,evidence,signal_id,resident_feedback)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const s of samples) {
      const created = new Date(now - s.age * 60_000).toISOString();
      const updates = [{ at: created, text: "Complaint received and routed to " + s.department + ".", by: "JANSETU demo triage" }];
      if (s.status === "In progress") updates.push({ at: new Date(now - 3 * 60_000).toISOString(), text: "A crew has been assigned and is on the way.", by: s.department });
      if (s.status === "Resolved") updates.push({ at: new Date(now - 22 * 60_000).toISOString(), text: "Repair completed. Evidence attached for resident review.", by: s.department });
      insert.run(s.code,s.title,s.description,s.category,s.department,s.status,s.priority,s.location,s.lat,s.lng,created,new Date().toISOString(),s.reporter,JSON.stringify(updates),s.evidence ?? null,s.signal ?? null,s.feedback ?? null);
    }
  }
  connection = db;
  return db;
}

export function listComplaints(): Complaint[] {
  const db = getDatabase();
  return db.prepare("SELECT * FROM complaints ORDER BY created_at DESC").all() as Complaint[];
}

export function addComplaint(input: Omit<Complaint, "id" | "created_at" | "updated_at" | "updates" | "evidence" | "resident_feedback" | "signal_id">) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const similar = db.prepare("SELECT code,signal_id,lat,lng FROM complaints WHERE category = ?").all(input.category) as { code:string; signal_id:string|null; lat:number; lng:number }[];
  const rad = (n:number) => (n * Math.PI) / 180;
  const near = similar.filter(item => { const dLat=rad(item.lat-input.lat),dLng=rad(item.lng-input.lng); const a=Math.sin(dLat/2)**2+Math.cos(rad(input.lat))*Math.cos(rad(item.lat))*Math.sin(dLng/2)**2; return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))<=600; });
  let signalId = near.find(item=>item.signal_id)?.signal_id ?? null;
  if (near.length && !signalId) signalId = `SIG-${String(input.lat).replace(".","").slice(-3)}${String(input.lng).replace(".","").slice(-3)}`;
  if (signalId) {
    for (const item of near) if (item.signal_id !== signalId) db.prepare("UPDATE complaints SET signal_id = ? WHERE code = ?").run(signalId,item.code);
  }
  const dupeCount = signalId ? (db.prepare("SELECT COUNT(*) AS n FROM complaints WHERE signal_id = ?").get(signalId) as {n:number}).n : 0;
  const priority = dupeCount >= 3 ? "Critical" : dupeCount >= 1 ? "High" : input.priority;
  const code = `PY-${Math.floor(2100 + Math.random() * 7800)}`;
  const updates = [{ at: now, text: `Complaint received and routed to ${input.department}.`, by: "Poya AI triage" }];
  const result = db.prepare(`INSERT INTO complaints
    (code,title,description,category,department,status,priority,location,lat,lng,created_at,updated_at,reporter,updates,signal_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code,input.title,input.description,input.category,input.department,"Received",priority,input.location,input.lat,input.lng,now,now,input.reporter,JSON.stringify(updates),signalId);
  return db.prepare("SELECT * FROM complaints WHERE id = ?").get(Number(result.lastInsertRowid)) as Complaint;
}

export function updateComplaint(code: string, body: { status?: string; note?: string; evidence?: string; feedback?: string }) {
  const db = getDatabase();
  const existing = db.prepare("SELECT * FROM complaints WHERE code = ?").get(code) as Complaint | undefined;
  if (!existing) return null;
  const now = new Date().toISOString();
  let updates = JSON.parse(existing.updates) as { at:string; text:string; by:string }[];
  if (body.status && body.status !== existing.status) updates = [...updates, { at: now, text: `Status updated to ${body.status}.`, by: existing.department }];
  if (body.note) updates = [...updates, { at: now, text: body.note, by: existing.department }];
  if (body.evidence) updates = [...updates, { at: now, text: "FixProof evidence added for resident review.", by: existing.department }];
  if (body.feedback) updates = [...updates, { at: now, text: body.feedback === "fixed" ? "Resident confirmed the fix worked." : "Resident reported the issue is still present; case reopened.", by: "Resident" }];
  const status = body.feedback === "still_broken" ? "In progress" : body.status ?? existing.status;
  db.prepare(`UPDATE complaints SET status=?, updated_at=?, updates=?, evidence=COALESCE(?,evidence), resident_feedback=COALESCE(?,resident_feedback) WHERE code=?`)
    .run(status, now, JSON.stringify(updates), body.evidence ?? null, body.feedback ?? null, code);
  return db.prepare("SELECT * FROM complaints WHERE code = ?").get(code) as Complaint;
}
