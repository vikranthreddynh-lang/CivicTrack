import { notFound } from "next/navigation";
import JanSetuApp from "@/app/poya-app";

export default function LocalDemoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <JanSetuApp localDemo/>;
}
