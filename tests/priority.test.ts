import { describe,expect,it } from "vitest";
import { calculatePriority } from "@/lib/priority";

describe("explainable complaint priority",()=>{
  it("returns a bounded score and named evidence factors",()=>{const result=calculatePriority({severity:.6,communityImpact:40,repeatReports:2});expect(result.score).toBeGreaterThanOrEqual(0);expect(result.score).toBeLessThanOrEqual(100);expect(result.reasons.map(x=>x.factor)).toContain("community_impact");});
  it("does not let an AI safety signal declare a P0 emergency",()=>{const result=calculatePriority({severity:1,communityImpact:100,repeatReports:5,aiSafetySignal:true});expect(result.priority).toBe("p1");expect(result.requiresHumanReview).toBe(true);});
  it("allows a low score to remain P3",()=>{expect(calculatePriority({severity:0,communityImpact:0}).priority).toBe("p3");});
  it("raises priority as community impact increases",()=>{const low=calculatePriority({severity:.5,communityImpact:0});const high=calculatePriority({severity:.5,communityImpact:100});expect(high.score).toBeGreaterThan(low.score);});
});
