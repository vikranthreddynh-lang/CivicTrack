import { notFound } from "next/navigation";
import ResidentDashboard from "@/app/resident/resident-dashboard";

export const dynamic = "force-dynamic";

export default function ResidentDemoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ResidentDashboard name="Demo resident" localDemo />;
}
