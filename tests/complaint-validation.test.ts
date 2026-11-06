import { describe, expect, it } from "vitest";
import { reportSchema, trackingCodePattern } from "@/lib/complaint-validation";

describe("resident complaint validation",()=>{
  const valid={title:"Broken streetlight",description:"The light has been out for several nights.",category:"Streetlights",address:"Near the public library",coordinates:null,aiConsent:false,mediaConsent:false};
  it("allows an anonymous report without AI consent or coordinates",()=>{expect(reportSchema.safeParse(valid).success).toBe(true);});
  it("rejects an out-of-range GPS coordinate",()=>{expect(reportSchema.safeParse({...valid,coordinates:{lat:120,lng:77}}).success).toBe(false);});
  it("rejects unsupported categories and missing details",()=>{expect(reportSchema.safeParse({...valid,category:"Other thing"}).success).toBe(false);expect(reportSchema.safeParse({...valid,title:"bad"}).success).toBe(false);});
  it("accepts only non-sequential-format random tracking references",()=>{expect(trackingCodePattern.test("JS-A0B1C2D3E4")).toBe(true);expect(trackingCodePattern.test("1")).toBe(false);expect(trackingCodePattern.test("JS-123")).toBe(false);});
});
