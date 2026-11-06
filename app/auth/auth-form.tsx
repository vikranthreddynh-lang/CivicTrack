"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type AuthMode = "resident-login" | "admin-login" | "signup" | "forgot" | "reset";
const configHelp = "Sign-in is not connected yet. Add the Supabase URL and publishable key from .env.example, then restart the app.";

export default function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const isAdmin = mode === "admin-login";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setError(configHelp); setBusy(false); return; }
    try {
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback?next=/resident` },
        });
        if (authError) throw authError;
        if (data.session) router.replace("/resident");
        else setMessage("Check your email to confirm your account, then sign in. Public signup always creates a resident account.");
      } else if (mode === "forgot") {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
        if (authError) throw authError;
        setMessage("If an account exists for that email, a password reset link has been sent.");
      } else if (mode === "reset") {
        if (password !== confirm) throw new Error("The passwords do not match.");
        if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw authError;
        setMessage("Password updated. You can now sign in.");
      } else {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        const { data: roleRow, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).maybeSingle();
        if (roleError) throw roleError;
        const role = roleRow?.role === "admin" ? "admin" : "resident";
        if (isAdmin && role !== "admin") {
          await supabase.auth.signOut();
          throw new Error("This account is not an administrator. Use resident sign-in or ask an admin to invite you.");
        }
        if (!isAdmin && role === "admin") { router.replace("/admin"); return; }
        router.replace(isAdmin ? "/admin" : "/resident");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete sign-in. Try again.");
    } finally { setBusy(false); }
  }

  const title = mode === "signup" ? "Create your resident account" : mode === "admin-login" ? "Admin workspace" : mode === "forgot" ? "Reset your password" : mode === "reset" ? "Choose a new password" : "Welcome back";
  return <main className="auth-page"><Link href="/" className="auth-brand">JANSETU<span>·</span></Link><section className="auth-card" aria-labelledby="auth-title">
    <span className="auth-kicker">{isAdmin ? "CITY OPERATIONS" : "RESIDENT PORTAL"}</span><h1 id="auth-title">{title}</h1><p className="auth-intro">{isAdmin ? "Sign in with an invited administrator account." : mode === "signup" ? "Report local issues and follow every update." : "Sign in to follow your reports and neighborhood signals."}</p>
    <form onSubmit={submit}>
      {mode === "signup"&&<label>Full name<input autoComplete="name" value={name} onChange={e=>setName(e.target.value)} required maxLength={100}/></label>}
      {mode !== "reset"&&<label>Email address<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254}/></label>}
      {mode !== "forgot"&&<label>{mode === "reset" ? "New password" : "Password"}<input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} maxLength={128}/></label>}
      {mode === "reset"&&<label>Confirm password<input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} required minLength={8} maxLength={128}/></label>}
      {error&&<p className="auth-error" role="alert">{error}</p>}{message&&<p className="auth-success" role="status">{message}</p>}
      <button className="auth-submit" disabled={busy}>{busy?"Please wait…":mode === "signup"?"Create resident account":mode === "forgot"?"Send reset link":mode === "reset"?"Update password":"Sign in"}</button>
    </form>
    {mode === "resident-login"&&<div className="auth-links"><Link href="/forgot-password">Forgot password?</Link><span>New here? <Link href="/signup">Create an account</Link></span></div>}
    {mode === "admin-login"&&<div className="auth-links"><span>Need admin access? Ask an existing administrator for an invitation.</span><Link href="/login">Resident sign-in</Link></div>}
    {mode === "signup"&&<div className="auth-links"><span>Already have an account? <Link href="/login">Sign in</Link></span><small>Public registration only creates resident access.</small></div>}
    {(mode === "forgot"||mode === "reset")&&<div className="auth-links"><Link href="/login">Back to sign in</Link></div>}
  </section><p className="auth-footer">See it. Speak it. Signal it. Fix it. Prove it.</p></main>;
}
