import { z } from "zod";

export const trackingCodePattern=/^JS-[A-F0-9]{10}$/i;
export const reportSchema=z.object({
  title:z.string().trim().min(4).max(120),
  description:z.string().trim().min(8).max(2000),
  category:z.enum(["Roads","Water","Drainage","Sanitation","Streetlights","Public safety","Other"]),
  address:z.string().trim().min(3).max(300),
  coordinates:z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)}).nullable().optional(),
  aiConsent:z.boolean(),
  mediaConsent:z.boolean(),
});
