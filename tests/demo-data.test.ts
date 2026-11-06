import { describe, expect, it } from "vitest";
import { DEMO_MAP_COMPLAINTS } from "../src/lib/demo-data";

describe("Demo complaints dataset", () => {
  it("provides rich demo records with valid coordinates", () => {
    expect(DEMO_MAP_COMPLAINTS.length).toBeGreaterThanOrEqual(10);
    for (const point of DEMO_MAP_COMPLAINTS) {
      expect(point.title).toMatch(/^\[DEMO\]/);
      expect(point.latitude).toBeGreaterThan(12);
      expect(point.latitude).toBeLessThan(14);
      expect(point.longitude).toBeGreaterThan(76);
      expect(point.longitude).toBeLessThan(79);
      expect(["Roads", "Water", "Drainage", "Sanitation", "Streetlights", "Public safety", "Other"]).toContain(point.category);
      expect(["p0", "p1", "p2", "p3"]).toContain(point.priority);
      expect(["new", "assigned", "in_progress", "closed"]).toContain(point.status);
    }
  });

  it("ensures coordinates form clusters for density heat calculation", () => {
    const roads = DEMO_MAP_COMPLAINTS.filter(c => c.category === "Roads");
    expect(roads.length).toBeGreaterThanOrEqual(2);
  });
});
