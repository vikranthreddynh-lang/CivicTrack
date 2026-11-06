import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JANSETU — Civic care, made visible",
  description: "One clear path from citizen report to civic resolution."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
