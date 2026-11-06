"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CheckCircle2, ChevronRight, Clock3, FilePlus2, MapPin, ShieldCheck, Sparkles, Trees, Waves } from "lucide-react";
import { Complaint, ReportModal } from "@/components/admin-dashboard";
import ResidentHeatmap from "@/components/resident-heatmap";
import QRCode from "qrcode";
import "./resident.css";
import "./confirmation.css";
import "./jansetu-theme.css";

export default function ResidentHome() {
  const [show, setShow] = useState(false);
  const [recent, setRecent] = useState<Complaint[]>([]);
  const [submitted, setSubmitted] = useState<Complaint | null>(null);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        setRecent(JSON.parse(localStorage.getItem("jansetu-recent") || "[]"));
      } catch {
        setRecent([]);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!submitted) return;
    QRCode.toDataURL(
      `${window.location.origin}/track?code=${encodeURIComponent(submitted.id)}`,
      { width: 144, margin: 1, color: { dark: "#263650", light: "#ffffff" } }
    )
      .then(setQr)
      .catch(() => setQr(""))
      .finally(() => setCopied(false));
  }, [submitted]);

  function onSubmit(item: Complaint) {
    setSubmitted(item);
    setRecent((prev) => [item, ...prev].slice(0, 8));
  }

  return (
    <main className="resident-page">
      <header className="resident-nav">
        <Link href="/" className="resident-brand">
          <span><Sparkles size={18} /></span>
          <b>JanSetu</b>
          <small>Community services</small>
        </Link>
        <nav>
          <Link href="/track"><Clock3 size={15} /> Track a report</Link>
          <Link href="/admin/login" className="staff-link">Municipal staff <ArrowRight size={14} /></Link>
        </nav>
      </header>

      <div className="resident-main">
        <section className="resident-hero">
          <div className="resident-hero-copy">
            <div className="eyebrow"><span className="live-dot" /> COMMUNITY SERVICES</div>
            <h1>A better city starts<br />with <span>being heard.</span></h1>
            <p>Report a civic issue in your neighborhood. We’ll connect it with the right municipal team and keep you updated.</p>
            <button className="primary-button resident-cta" onClick={() => setShow(true)}>
              <FilePlus2 size={17} /> Report an issue <ArrowRight size={15} />
            </button>
            <div className="no-account">
              <ShieldCheck size={15} /> No account required <span>·</span> Takes about 2 minutes
            </div>
          </div>
          <div className="city-illustration">
            <div className="sun" />
            <div className="city-hill hill-back" />
            <div className="city-hill hill-front" />
            <div className="building building-a"><i /><i /><i /><i /></div>
            <div className="building building-b"><i /><i /><i /><i /><i /><i /></div>
            <div className="building building-c"><i /><i /><i /></div>
            <div className="tree tree-a"><Trees size={39} /></div>
            <div className="tree tree-b"><Trees size={31} /></div>
            <div className="city-road" />
            <div className="city-pin"><MapPin size={20} fill="currentColor" /></div>
            <div className="city-caption"><span /> Your neighborhood, better</div>
          </div>
        </section>

        {/* Live Resident Heatmap Section */}
        <ResidentHeatmap />

        <section className="resident-steps">
          <div className="resident-section-heading">
            <div>
              <span className="modal-kicker">SIMPLE. TRANSPARENT. ACCOUNTABLE.</span>
              <h2>From report to resolution</h2>
            </div>
            <p>Every report gets a reference you can track.<br />No sign-up, no complicated forms.</p>
          </div>
          <div className="steps-grid">
            <Step number="01" icon={<FilePlus2 size={18} />} title="Tell us what happened" text="Describe the issue, add a photo, and mark its location." />
            <Step number="02" icon={<Waves size={18} />} title="We route it to the right team" text="Your report is reviewed and assigned to the responsible department." />
            <Step number="03" icon={<CheckCircle2 size={18} />} title="Follow the progress" text="Use your private tracking code to see updates and confirm the fix." />
          </div>
        </section>

        <section className="resident-recent">
          <div className="resident-section-heading">
            <div>
              <span className="modal-kicker">SAVED ON THIS DEVICE</span>
              <h2>Your recent reports</h2>
              <p className="device-note">Device-specific history can disappear if browser data is cleared.</p>
            </div>
            <Link href="/track" className="track-all">Track a report <ArrowRight size={14} /></Link>
          </div>
          {recent.length === 0 ? (
            <div className="no-reports">
              <div><Clock3 size={20} /></div>
              <span>
                <b>No saved reports yet</b>
                <small>Your submitted reports will appear here on this device.</small>
              </span>
              <button onClick={() => setShow(true)}>Make your first report <ArrowRight size={13} /></button>
            </div>
          ) : (
            <div className="saved-list">
              {recent.map((item) => (
                <Link className="saved-row" href={`/track?code=${encodeURIComponent(item.id)}`} key={item.id}>
                  <div>
                    <b>{item.title}</b>
                    <small>{item.id} · {item.category} · {item.time}</small>
                  </div>
                  <span>{item.status}</span>
                  <ChevronRight size={15} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <footer className="resident-footer">
          <span>© 2026 JanSetu · Municipal services</span>
          <span><ShieldCheck size={13} /> Your privacy matters</span>
        </footer>
      </div>

      {show && <ReportModal onClose={() => setShow(false)} onSubmit={onSubmit} />}

      {submitted && (
        <div className="success-backdrop">
          <section className="success-card">
            <div className="success-check"><CheckCircle2 size={27} /></div>
            <span className="modal-kicker">REPORT RECEIVED</span>
            <h2>Thanks for speaking up.</h2>
            <p>Your report has a tracking code. Save it to check progress later.</p>
            <div className="tracking-code-display">{submitted.id}</div>
            {qr && <Image className="confirmation-qr" src={qr} alt="QR code to track your complaint" width={112} height={112} unoptimized />}
            <div className="confirmation-actions">
              <button onClick={async () => { await navigator.clipboard.writeText(submitted.id); setCopied(true); }}>
                {copied ? "Copied" : "Copy code"}
              </button>
              <button onClick={async () => {
                if (navigator.share) await navigator.share({ title: "JanSetu complaint tracking", text: `Track my complaint ${submitted.id}`, url: `${window.location.origin}/track?code=${encodeURIComponent(submitted.id)}` });
                else { await navigator.clipboard.writeText(`${window.location.origin}/track?code=${encodeURIComponent(submitted.id)}`); setCopied(true); }
              }}>Share</button>
            </div>
            <Link href={`/track?code=${encodeURIComponent(submitted.id)}`} className="primary-button">
              Track this report <ArrowRight size={15} />
            </Link>
            <button className="success-dismiss" onClick={() => setSubmitted(null)}>Back to JanSetu</button>
            <small>
              {submitted.ward === "Demo mode"
                ? "Demo mode: this report is saved only in this browser until Supabase is configured."
                : "Your code is also saved to this device. Exact location is never shown on public tracking."}
            </small>
          </section>
        </div>
      )}
    </main>
  );
}

function Step({ number, icon, title, text }: { number: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="step-card">
      <div className="step-top">
        <span>{number}</span>
        <i>{icon}</i>
      </div>
      <b>{title}</b>
      <p>{text}</p>
    </article>
  );
}
