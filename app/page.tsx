import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/supabase/auth-context";

export default async function Home() {
  const { user, role } = await getCurrentUserContext();
  if (user) redirect(role === "admin" ? "/admin" : "/resident");
  return <main className="landing-page"><header className="landing-nav"><Link href="/" className="auth-brand">JANSETU<span>·</span></Link><nav><Link href="/login">Resident sign in</Link><Link href="/admin/login">Admin sign in</Link></nav></header><section className="landing-hero"><span className="auth-kicker">CIVIC ISSUES, ACCOUNTABLE TO EVERYONE</span><h1>See it. Speak it.<br/><em>Signal it. Fix it. Prove it.</em></h1><p>Report local problems once. Follow the responsible team, see progress, and confirm when the fix works.</p><div className="landing-actions"><Link className="auth-submit landing-primary" href="/signup">Create resident account</Link><Link className="landing-secondary" href="/login">Sign in to track a report</Link></div><div className="landing-capabilities"><span><b>01</b> Report roads, waste, water, and lighting issues</span><span><b>02</b> See reports prioritized and routed</span><span><b>03</b> Track proof and confirm the repair</span></div></section><footer className="landing-footer"><span>JANSETU</span><span>Built for clearer, more accountable city services</span>{process.env.NODE_ENV!=="production"&&<Link href="/demo">Open local demo dashboard</Link>}</footer></main>;
}
