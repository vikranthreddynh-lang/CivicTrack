export type DemoMapComplaint = {
  complaint_id: string;
  title: string;
  category: string;
  status: string;
  priority: string;
  latitude: number;
  longitude: number;
  created_at: string;
  ward: string;
};

export const DEFAULT_RESIDENT_REPORTS = [
  { id: "JS-A1B2C3D4E5", title: "[DEMO] Large pothole near metro station entrance", category: "Roads", ward: "[DEMO] Central Ward", status: "New", priority: "Medium", time: "10 min ago", address: "[DEMO] 12th Main Rd, Central Ward" },
  { id: "JS-B2C3D4E5F6", title: "[DEMO] Major potable water pipeline leak", category: "Water", ward: "[DEMO] Central Ward", status: "Assigned", priority: "High", time: "45 min ago", address: "[DEMO] 4th Cross Road, Central Ward" },
  { id: "JS-C3D4E5F6A1", title: "[DEMO] Faulty streetlights creating dark zone near school", category: "Streetlights", ward: "[DEMO] South Ward", status: "In progress", priority: "Medium", time: "2 hrs ago", address: "[DEMO] School Cross Road, South Ward" },
  { id: "JS-D4E5F6A1B2", title: "[DEMO] Blocked stormwater drain overflowing onto road", category: "Drainage", ward: "[DEMO] Central Ward", status: "Work completed", priority: "High", time: "5 hrs ago", address: "[DEMO] 80ft Canal Road, Central Ward" },
  { id: "JS-E5F6A1B2C3", title: "[DEMO] Community garbage dump cleared and sanitized", category: "Sanitation", ward: "[DEMO] East Ward", status: "Verified", priority: "Low", time: "Yesterday", address: "[DEMO] Market Cross, East Ward" },
  { id: "JS-F6A1B2C3D4", title: "[DEMO] Broken footpath pavers repaired", category: "Roads", ward: "[DEMO] South Ward", status: "Closed", priority: "Low", time: "2 days ago", address: "[DEMO] Commercial Boulevard, South Ward" },
  { id: "JS-1A2B3C4D5E", title: "[DEMO] Low domestic water pressure during peak hours", category: "Water", ward: "[DEMO] East Ward", status: "Accepted", priority: "Medium", time: "3 days ago", address: "[DEMO] Residential Sector 7, East Ward" },
  { id: "JS-2B3C4D5E6F", title: "[DEMO] Sparking distribution box adjacent to children playground", category: "Public safety", ward: "[DEMO] Central Ward", status: "In progress", priority: "Critical", time: "Just now", address: "[DEMO] Children Park Perimeter Road, Central Ward" }
];

export const DEMO_MAP_COMPLAINTS: DemoMapComplaint[] = [
  { complaint_id: "demo-1", title: "[DEMO] Large pothole on main road", category: "Roads", status: "in_progress", priority: "p1", latitude: 12.9732, longitude: 77.5961, created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(), ward: "[DEMO] Central Ward" },
  { complaint_id: "demo-2", title: "[DEMO] Water leaking from roadside pipe", category: "Water", status: "assigned", priority: "p0", latitude: 12.9741, longitude: 77.5983, created_at: new Date(Date.now() - 1000 * 60 * 38).toISOString(), ward: "[DEMO] Central Ward" },
  { complaint_id: "demo-3", title: "[DEMO] Streetlight not working", category: "Streetlights", status: "new", priority: "p2", latitude: 12.9725, longitude: 77.5950, created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(), ward: "[DEMO] Central Ward" },
  { complaint_id: "demo-4", title: "[DEMO] Waste not collected for 3 days", category: "Sanitation", status: "in_progress", priority: "p2", latitude: 12.9750, longitude: 77.5972, created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(), ward: "[DEMO] Central Ward" },
  { complaint_id: "demo-5", title: "[DEMO] Drain overflowing after rain", category: "Drainage", status: "new", priority: "p1", latitude: 12.9730, longitude: 77.5958, created_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(), ward: "[DEMO] Central Ward" },
  { complaint_id: "demo-6", title: "[DEMO] Water pressure low on block", category: "Water", status: "assigned", priority: "p2", latitude: 12.9745, longitude: 77.5990, created_at: new Date(Date.now() - 1000 * 60 * 300).toISOString(), ward: "[DEMO] Central Ward" },
  { complaint_id: "demo-7", title: "[DEMO] Damaged footpath near school", category: "Roads", status: "in_progress", priority: "p1", latitude: 12.9722, longitude: 77.5948, created_at: new Date(Date.now() - 1000 * 60 * 1440).toISOString(), ward: "[DEMO] Central Ward" },
  { complaint_id: "demo-8", title: "[DEMO] Streetlight out for a week", category: "Streetlights", status: "closed", priority: "p3", latitude: 12.9755, longitude: 77.5978, created_at: new Date(Date.now() - 1000 * 60 * 1500).toISOString(), ward: "[DEMO] Central Ward" },
  { complaint_id: "demo-9", title: "[DEMO] Repeat pothole cluster", category: "Roads", status: "new", priority: "p2", latitude: 12.9734, longitude: 77.5963, created_at: new Date(Date.now() - 1000 * 60 * 2880).toISOString(), ward: "[DEMO] Central Ward" },
  { complaint_id: "demo-10", title: "[DEMO] Open manhole cover on footpath", category: "Drainage", status: "new", priority: "p0", latitude: 12.9728, longitude: 77.5965, created_at: new Date(Date.now() - 1000 * 60 * 3200).toISOString(), ward: "[DEMO] Central Ward" },
  { complaint_id: "demo-11", title: "[DEMO] Low hanging electrical wire", category: "Public safety", status: "in_progress", priority: "p0", latitude: 12.9715, longitude: 77.5935, created_at: new Date(Date.now() - 1000 * 60 * 4000).toISOString(), ward: "[DEMO] Central Ward" },
  { complaint_id: "demo-12", title: "[DEMO] Broken traffic signal", category: "Public safety", status: "assigned", priority: "p1", latitude: 12.9708, longitude: 77.5952, created_at: new Date(Date.now() - 1000 * 60 * 4500).toISOString(), ward: "[DEMO] Central Ward" },
  { complaint_id: "demo-13", title: "[DEMO] Stagnant water breeding mosquitoes", category: "Drainage", status: "new", priority: "p2", latitude: 12.9738, longitude: 77.5970, created_at: new Date(Date.now() - 1000 * 60 * 5000).toISOString(), ward: "[DEMO] Central Ward" },
  { complaint_id: "demo-14", title: "[DEMO] Park bench vandalized and broken", category: "Sanitation", status: "closed", priority: "p3", latitude: 12.9760, longitude: 77.5980, created_at: new Date(Date.now() - 1000 * 60 * 6000).toISOString(), ward: "[DEMO] Central Ward" },
];
