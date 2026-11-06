"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import "./login.css";
import "../../jansetu-theme.css";

export default function AdminLogin(){const[email,setEmail]=useState("");const[password,setPassword]=useState("");const[error,setError]=useState("");const[busy,setBusy]=useState(false);const router=useRouter();
 async function submit(e:FormEvent){e.preventDefault();setError("");const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!url||!key){setError("Staff sign-in is unavailable until Supabase is configured.");return;}setBusy(true);try{const supabase=createBrowserClient(url,key);const{error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;router.replace("/admin");router.refresh();}catch(e){setError(e instanceof Error?e.message:"Unable to sign in.");}finally{setBusy(false);}}
 return <main className="login-page"><Link href="/" className="login-back"><ArrowLeft size={15}/> Resident portal</Link><section className="login-card"><div className="login-mark"><Activity size={21}/></div><span className="modal-kicker">MUNICIPAL STAFF</span><h1>Welcome back</h1><p>Sign in to your JanSetu workspace.</p><form onSubmit={submit}><label>Email address<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@municipality.gov"/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/></label>{error&&<div className="login-error">{error}</div>}<button className="primary-button" disabled={busy}>{busy?"Signing in…":"Sign in securely"}<ArrowRight size={15}/></button></form><div className="login-secure"><LockKeyhole size={14}/> Secured with Supabase Authentication</div><div className="login-note"><ShieldCheck size={15}/> Staff accounts are provisioned by a municipal administrator. Public registration is disabled.</div></section><footer>© 2026 JanSetu · Community sample data</footer></main>}
