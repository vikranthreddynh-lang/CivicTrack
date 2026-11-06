"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type ResidentComplaint = { id:string|number; code:string; title:string; description:string; category:string; department:string; status:string; priority:string; location:string; created_at:string; updated_at:string; updates:string|Array<{at:string;text:string;by:string}>; photo_urls?:string[]|string; photo_paths?:string[]; evidence?:string|null; evidence_url?:string|null; resident_feedback?:string|null };
type ResidentTriage={title:string;summary:string;category:string;department:string;priority:string;confidence:number};
const categories=["Roads","Waste","Water","Streetlights"];
const priorityRank:Record<string,number>={Critical:0,High:1,Normal:2,Low:3};
function updatesOf(value:ResidentComplaint["updates"]){if(Array.isArray(value))return value;try{return JSON.parse(value||"[]") as Array<{at:string;text:string;by:string}>;}catch{return [];}}

export default function ResidentDashboard({name,localDemo=false}:{name:string;localDemo?:boolean}) {
  const [complaints,setComplaints]=useState<ResidentComplaint[]>([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [statusFilter,setStatusFilter]=useState("All reports");
  const [description,setDescription]=useState("");
  const [title,setTitle]=useState("");
  const [category,setCategory]=useState("Roads");
  const [location,setLocation]=useState("");
  const [lat,setLat]=useState<number|null>(null);
  const [lng,setLng]=useState<number|null>(null);
  const [photos,setPhotos]=useState<File[]>([]);
  const [locating,setLocating]=useState(false);
  const [triage,setTriage]=useState<ResidentTriage|null>(null);
  const [triageBusy,setTriageBusy]=useState(false);
  const [triageMessage,setTriageMessage]=useState("");

  async function refresh(){
    setLoading(true);
    try{const response=await fetch("/api/complaints",{cache:"no-store"});if(response.status===401){window.location.assign("/login");return;}const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not load your reports.");setComplaints(data);}
    catch(caught){setError(caught instanceof Error?caught.message:"Could not load your reports.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void refresh();},[]);
  const visible=useMemo(()=>complaints.filter(c=>statusFilter==="All reports"||c.status===statusFilter).sort((a,b)=>(priorityRank[a.priority]??3)-(priorityRank[b.priority]??3)||new Date(b.created_at).getTime()-new Date(a.created_at).getTime()),[complaints,statusFilter]);
  const active=complaints.filter(c=>c.status!=="Resolved").length;
  const escalated=complaints.filter(c=>c.status!=="Resolved"&&Date.now()-new Date(c.created_at).getTime()>24*60*60_000).length;

  function useCurrentLocation(){
    setError("");
    if(!navigator.geolocation){setError("This browser does not provide location. Search for an address instead.");return;}
    setLocating(true);navigator.geolocation.getCurrentPosition(position=>{setLat(position.coords.latitude);setLng(position.coords.longitude);setLocation("Current location");setLocating(false);},()=>{setError("Location permission was unavailable. Enter an address and select Pin address.");setLocating(false);},{enableHighAccuracy:true,timeout:10000});
  }
  async function pinAddress(){
    if(location.trim().length<3){setError("Enter a nearby address or landmark first.");return;}
    setLocating(true);setError("");
    try{const response=await fetch(`/api/geocode?q=${encodeURIComponent(location.trim())}`);const point=await response.json();if(!response.ok)throw new Error(point.error||"Could not find the address.");setLat(point.lat);setLng(point.lng);}
    catch(caught){setError(caught instanceof Error?caught.message:"Could not find the address.");}
    finally{setLocating(false);}
  }
  async function requestTriage(){
    if(description.trim().length<8){setTriageMessage("Describe the issue first.");return;}
    setTriageBusy(true);setTriageMessage("");
    try{const response=await fetch("/api/triage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({description:description.trim()})});const data=await response.json();if(!response.ok||!data.available||!data.suggestion){setTriage(null);setTriageMessage(data.message||"AI suggestions are unavailable. Your report is still ready to submit.");return;}setTriage(data.suggestion);setTriageMessage("Review this optional suggestion before applying it.");}
    catch{setTriage(null);setTriageMessage("Could not reach the AI service. You can continue with your report.");}
    finally{setTriageBusy(false);}
  }
  function addPhotos(list:FileList|null){
    if(!list)return;
    const chosen=Array.from(list);
    if(chosen.some(file=>!file.type.startsWith("image/"))){setError("Choose image files only.");return;}
    if(chosen.some(file=>file.size>5*1024*1024)){setError("Each photo must be 5 MB or smaller.");return;}
    if(photos.length+chosen.length>3){setError("Attach up to 3 photos per report.");return;}
    setError("");setPhotos(current=>[...current,...chosen]);
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError("");setNotice("");
    if(description.trim().length<8){setError("Describe the issue in at least 8 characters.");return;}
    if(!location.trim()){setError("Add the issue location.");return;}
    setBusy(true);
    try{
      let issueLat=lat,issueLng=lng;
      if(issueLat===null||issueLng===null){const geocode=await fetch(`/api/geocode?q=${encodeURIComponent(location.trim())}`);const point=await geocode.json();if(!geocode.ok)throw new Error(point.error||"Pin the address or use your current location before submitting.");issueLat=point.lat;issueLng=point.lng;}
      const form=new FormData();form.set("title",title.trim()||description.trim().split(/[.!?\n]/)[0].slice(0,100)||`${category} issue`);form.set("description",description.trim());form.set("category",category);form.set("location",location.trim());form.set("lat",String(issueLat));form.set("lng",String(issueLng));form.set("reporter",name);photos.forEach(photo=>form.append("photos",photo,photo.name));
      const response=await fetch("/api/complaints",{method:"POST",body:form});const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not send the report.");
      setNotice(`Report received. Your tracking code is ${result.code}.`);setTitle("");setDescription("");setLocation("");setLat(null);setLng(null);setPhotos([]);setShowForm(false);await refresh();
    }catch(caught){setError(caught instanceof Error?caught.message:"Could not submit the report.");}
    finally{setBusy(false);}
  }
  const photoArray=(item:ResidentComplaint)=>{if(Array.isArray(item.photo_urls))return item.photo_urls;try{return JSON.parse(item.photo_urls||"[]") as string[];}catch{return [];}};

  return <main className="resident-page"><header className="resident-topbar"><Link href="/" className="auth-brand">JANSETU<span>·</span></Link><div><span>{localDemo?"Demo resident · local data only":`Signed in as ${name}`}</span>{localDemo?<Link href="/demo" className="signout-button">Open admin demo</Link>:<form action="/auth/logout" method="post"><button className="signout-button">Sign out</button></form>}</div></header>
    {localDemo&&<div className="resident-demo-notice">DEMO WORKSPACE · Reports submitted here appear in the local admin dashboard. This demo data is not shared online.</div>}
    <section className="resident-welcome"><div><span className="auth-kicker">YOUR RESIDENT WORKSPACE</span><h1>Your voice moves things forward.</h1><p>Track the teams and evidence behind every report you send.</p></div><button className="auth-submit" onClick={()=>{setError("");setShowForm(v=>!v);}}>{showForm?"Close report":"＋ Report an issue"}</button></section>
    {error&&!showForm&&<p className="auth-error" role="alert">{error}</p>}{notice&&<p className="auth-success" role="status">{notice}</p>}
    <section className="resident-metrics"><article><span>My reports</span><b>{complaints.length}</b></article><article><span>Open</span><b>{active}</b></article><article><span>Resolved</span><b>{complaints.filter(c=>c.status==="Resolved").length}</b></article><article><span>Needs attention</span><b>{escalated}</b></article></section>
    {showForm&&<form className="resident-report-form" onSubmit={submit}><div className="resident-form-heading"><div><span className="auth-kicker">NEW CIVIC REPORT</span><h2>What needs fixing?</h2></div></div>
      <label>Issue title <span>Optional</span><input value={title} maxLength={100} onChange={e=>setTitle(e.target.value)} placeholder="A clear, short title"/></label>
      <label>Issue category<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(item=><option key={item}>{item}</option>)}</select></label>
      <label>Describe the problem<textarea value={description} onChange={e=>{setDescription(e.target.value);setTriage(null);setTriageMessage("");}} minLength={8} maxLength={5000} rows={4} required placeholder="What happened, and how is it affecting the area?"/></label>
      <div className="resident-ai-row"><button type="button" className="secondary-button" onClick={requestTriage} disabled={triageBusy||description.trim().length<8}>{triageBusy?"Preparing…":"✦ Suggest with Gemini"}</button><small>Optional · sends this description to Gemini</small></div>
      {triageMessage&&<p className="ai-message" role="status">{triageMessage}</p>}{triage&&<div className="ai-suggestion-card"><div className="ai-suggestion-heading"><b>Suggestion to review</b><span>{Math.round(triage.confidence*100)}% confidence</span></div><p><strong>Summary:</strong> {triage.summary}</p><p><strong>Category:</strong> {triage.category} · {triage.department}</p><p><strong>Priority suggestion:</strong> {triage.priority}</p><button type="button" className="secondary-button" onClick={()=>{setTitle(triage.title);setCategory(triage.category);setTriageMessage("Title and category applied. Review your description; priority will be automatically scored when submitted.");}}>Apply title and category</button><small>City staff can review priority. Check AI suggestions before submitting.</small></div>}
      <label>Issue location<div className="resident-location-row"><input value={location} onChange={e=>{setLocation(e.target.value);setLat(null);setLng(null);}} required placeholder="Address or nearby landmark"/><button type="button" onClick={pinAddress} disabled={locating}>Pin address</button><button type="button" onClick={useCurrentLocation} disabled={locating}>{locating?"Locating…":"Use current location"}</button></div></label>
      <label>Photos <span>Up to 3 images · 5 MB each</span><input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple onChange={event=>{addPhotos(event.target.files);event.target.value="";}}/></label>
      {photos.length>0&&<div className="selected-photos">{photos.map((photo,index)=><span key={`${photo.name}-${index}`}>{photo.name}<button type="button" aria-label={`Remove ${photo.name}`} onClick={()=>setPhotos(current=>current.filter((_,i)=>i!==index))}>×</button></span>)}</div>}
      {error&&<p className="auth-error" role="alert">{error}</p>}<div className="resident-form-actions"><small>Priority is suggested automatically and can be reviewed by city staff.</small><button className="auth-submit" disabled={busy}>{busy?"Submitting…":"Submit report"}</button></div>
    </form>}
    <section className="resident-reports"><div className="resident-list-heading"><div><span className="auth-kicker">FOLLOW THROUGH</span><h2>My reports</h2></div><label>Show<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>{["All reports","Received","Assigned","In progress","Resolved"].map(value=><option key={value}>{value}</option>)}</select></label></div>
      {loading?<p className="resident-empty">Loading your reports…</p>:visible.length===0?<p className="resident-empty">No reports match this view. Use “Report an issue” to tell the city what needs attention.</p>:<div className="resident-report-list">{visible.map(item=><article className="resident-report-card" key={item.code}><div className="resident-report-card-top"><div><span className="resident-code">{item.code} · {item.category}</span><h3>{item.title}</h3></div><span className={`priority-label priority-${item.priority.toLowerCase()}`}>{item.priority}</span></div><p>{item.description}</p><div className="resident-report-meta"><span>{item.status}</span><span>{item.department}</span><span>{item.location}</span><span>{new Date(item.updated_at).toLocaleDateString()}</span></div>{photoArray(item).length>0&&<div className="resident-photo-grid">{photoArray(item).map((src,index)=><img src={src} key={`${item.code}-${index}`} alt={`Photo attached to report ${item.code} ${index+1}`}/>)}</div>}{item.evidence&&<p className="resident-fixproof"><b>FixProof:</b> {item.evidence}</p>}{item.evidence_url&&<div className="resident-photo-grid"><img src={item.evidence_url} alt={`FixProof evidence for ${item.code}`}/></div>}<details><summary>View update history</summary><div className="resident-updates">{updatesOf(item.updates).slice().reverse().map((update,index)=><p key={`${update.at}-${index}`}><b>{update.text}</b><small>{update.by} · {new Date(update.at).toLocaleString()}</small></p>)}</div></details></article>)}</div>}
    </section>
  </main>;
}
