"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

type TimelineItem = { at: string; text: string; by: string };
type Complaint = {
  id:number; code:string; title:string; description:string; category:string; department:string; status:string; priority:string;
  location:string; lat:number; lng:number; created_at:string; updated_at:string; reporter:string; updates:string | TimelineItem[];
  evidence:string | null; evidence_url?:string|null; resident_feedback:string | null; signal_id:string | null; photo_urls?:string[]|string; photo_paths?:string[];
};
type NavPage = "Overview" | "Civic signals" | "Live map" | "Report an issue";

type MapPoint = Pick<Complaint, "code" | "title" | "category" | "status" | "lat" | "lng">;
type TriageSuggestion = { title: string; summary: string; category: string; department: string; priority: string; confidence: number };

let googleMapsPromise: Promise<void> | null = null;
const noMapPoints: MapPoint[] = [];

declare global {
  interface Window { gm_authFailure?: () => void }
}

const departments: Record<string,string> = { Roads:"Roads & Mobility", Waste:"Sanitation", Water:"Water Works", Streetlights:"Electrical Services" };
const categories = ["Roads", "Waste", "Water", "Streetlights"];
const statusList = ["Received", "Assigned", "In progress", "Resolved"];

function Icon({ name, size = 18 }: { name:string; size?:number }) {
  const paths: Record<string, React.ReactNode> = {
    grid:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    signal:<><path d="M3 12h3l2.2-6 4.4 12 2.2-6H21"/><circle cx="18" cy="6" r="2"/></>,
    map:<><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15m6-12v15"/></>,
    plus:<><path d="M12 5v14M5 12h14"/></>,
    search:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    chevron:<path d="m9 18 6-6-6-6"/>,
    down:<path d="m7 10 5 5 5-5"/>,
    pin:<><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check:<><path d="m5 12 4 4L19 6"/></>,
    route:<><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h4a4 4 0 0 0 4-4v-4a4 4 0 0 1 4-4"/></>,
    mic:<><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/></>,
    close:<path d="m18 6-12 12M6 6l12 12"/>,
    upload:<><path d="M12 16V4m-4 4 4-4 4 4"/><path d="M4 16v4h16v-4"/></>,
    spark:<><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></>,
    arrow:<><path d="M7 17 17 7M7 7h10v10"/></>,
    image:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></>,
    menu:<><path d="M4 6h16M4 12h16M4 18h16"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.grid}</svg>;
}

function MapsPanel({ lat, lng, location, compact=false, markers=noMapPoints, interactive=false, onLocationChange }: {
  lat:number; lng:number; location:string; compact?:boolean; markers?:MapPoint[]; interactive?:boolean;
  onLocationChange?:(lat:number,lng:number)=>void;
}) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapElement=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<google.maps.Map|null>(null);
  const locationMarker=useRef<google.maps.Marker|null>(null);
  const issueMarkers=useRef<google.maps.Marker[]>([]);
  const infoWindow=useRef<google.maps.InfoWindow|null>(null);
  const onLocationChangeRef=useRef(onLocationChange);
  const markersRef=useRef(markers);
  const [mapReady,setMapReady]=useState(false);
  const [mapError,setMapError]=useState("");
  onLocationChangeRef.current=onLocationChange;
  markersRef.current=markers;

  useEffect(()=>{
    if(!key||!mapElement.current)return;
    let cancelled=false;
    const previousAuthFailure=window.gm_authFailure;
    window.gm_authFailure=()=>{setMapError("Google Maps could not authorize this key. Showing the OpenStreetMap preview instead.");previousAuthFailure?.();};
    async function loadMap(){
      try{
        if(!googleMapsPromise){
          setOptions({key,v:"weekly"});
          googleMapsPromise=Promise.all([importLibrary("maps"),importLibrary("marker")]).then(()=>undefined).catch(error=>{googleMapsPromise=null;throw error;});
        }
        let timeoutId=0;
        try{await Promise.race([googleMapsPromise,new Promise<never>((_,reject)=>{timeoutId=window.setTimeout(()=>reject(new Error("Google Maps timed out")),12_000);})]);}
        finally{if(timeoutId)window.clearTimeout(timeoutId);}
        if(cancelled||!mapElement.current)return;
        const {Map}=await importLibrary("maps") as google.maps.MapsLibrary;
        const {Marker}=await importLibrary("marker") as google.maps.MarkerLibrary;
        const map=new Map(mapElement.current,{center:{lat,lng},zoom:compact?14:13,mapTypeControl:false,streetViewControl:false,fullscreenControl:true,gestureHandling:"cooperative",mapId:process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID||undefined});
        mapRef.current=map;
        infoWindow.current=new google.maps.InfoWindow();
        const marker=new Marker({map,position:{lat,lng},title:location,draggable:interactive,animation:undefined});
        locationMarker.current=marker;
        const reportPoint=(point:google.maps.LatLng|null)=>{if(!point)return;const next={lat:point.lat(),lng:point.lng()};onLocationChangeRef.current?.(next.lat,next.lng);};
        marker.addListener("dragend",(event:google.maps.MapMouseEvent)=>reportPoint(event.latLng??null));
        if(interactive)map.addListener("click",(event:google.maps.MapMouseEvent)=>{if(!event.latLng)return;marker.setPosition(event.latLng);reportPoint(event.latLng);});
        if(!interactive&&markersRef.current.length>1){
          const bounds=new google.maps.LatLngBounds();bounds.extend({lat,lng});
          for(const point of markersRef.current){bounds.extend({lat:point.lat,lng:point.lng});}
          map.fitBounds(bounds,32);
        }
        if(!cancelled)setMapReady(true);
      }catch{
        if(!cancelled)setMapError("Interactive Google Maps is unavailable. The OpenStreetMap preview and address search are still available.");
      }
    }
    void loadMap();
    return ()=>{cancelled=true;window.gm_authFailure=previousAuthFailure;issueMarkers.current.forEach(marker=>marker.setMap(null));locationMarker.current?.setMap(null);mapRef.current=null;locationMarker.current=null;infoWindow.current=null;setMapReady(false);};
  },[key,interactive]);

  useEffect(()=>{
    if(!mapRef.current||!mapReady)return;
    const center={lat,lng};
    mapRef.current.setCenter(center);
    locationMarker.current?.setPosition(center);
  },[lat,lng,mapReady]);

  useEffect(()=>{
    if(!mapRef.current||!mapReady)return;
    issueMarkers.current.forEach(marker=>marker.setMap(null));
    issueMarkers.current=[];
    if(interactive)return;
    for(const point of markers){
      const color=point.category==="Roads"?"#d08b54":point.category==="Water"?"#5b95b4":point.category==="Waste"?"#6f9b72":"#8b78a8";
      const marker=new google.maps.Marker({map:mapRef.current,position:{lat:point.lat,lng:point.lng},title:`${point.title} · ${point.category}`,icon:{path:google.maps.SymbolPath.CIRCLE,scale:8,fillColor:color,fillOpacity:1,strokeColor:"#ffffff",strokeWeight:2}});
      marker.addListener("click",()=>{
        const content=document.createElement("div");
        content.style.cssText="font:13px Arial,sans-serif;min-width:170px;padding:3px 5px;color:#253a30";
        const title=document.createElement("strong");title.textContent=point.title;
        const detail=document.createElement("div");detail.textContent=`${point.code} · ${point.category} · ${point.status}`;detail.style.cssText="margin-top:5px;color:#64756b;font-size:12px";
        content.append(title,detail);infoWindow.current?.setContent(content);infoWindow.current?.open({map:mapRef.current,anchor:marker});
      });
      issueMarkers.current.push(marker);
    }
  },[markers,mapReady,interactive]);

  const fallback=!key||Boolean(mapError);
  const src=`https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.008}%2C${lat-0.006}%2C${lng+0.008}%2C${lat+0.006}&layer=mapnik&marker=${lat}%2C${lng}`;
  return <div className={`map-frame${compact ? " map-frame-compact" : ""}`}>
    {fallback?<iframe title={`OpenStreetMap preview showing ${location}`} src={src} loading="lazy"/>:<div ref={mapElement} className="google-map-canvas" role="region" aria-label={`Interactive map showing ${location}`}/>}
    {!key&&<span className="map-credit">Google Maps key not set · OpenStreetMap preview</span>}
    {!key&&interactive&&<span className="map-status">Use “Pin address” or current location to set your pin.</span>}
    {mapError&&key&&<span className="map-status">{mapError}</span>}
    {!mapReady&&!fallback&&<span className="map-loading">Loading interactive map…</span>}
    <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noreferrer" className="map-open" aria-label="Open this location in Google Maps"><Icon name="arrow" size={13}/></a>
  </div>;
}

function ago(value:string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
function parseUpdates(value:Complaint["updates"]): TimelineItem[] {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value); } catch { return []; }
}
function parsePhotoUrls(value:Complaint["photo_urls"]): string[] { if(Array.isArray(value))return value;try{return JSON.parse(value||"[]");}catch{return [];} }
function categoryIcon(category:string) { return category === "Roads" ? "⌁" : category === "Waste" ? "▤" : category === "Water" ? "◉" : "✳"; }

export default function JanSetuApp({adminEmail="Administrator",localDemo=false}:{adminEmail?:string;localDemo?:boolean}) {
  const [complaints,setComplaints] = useState<Complaint[]>([]);
  const [page,setPage] = useState<NavPage>("Overview");
  const [loading,setLoading] = useState(true);
  const [search,setSearch] = useState("");
  const [filter,setFilter] = useState("All reports");
  const [priorityFilter,setPriorityFilter] = useState("All priorities");
  const [sortMode,setSortMode] = useState("priority");
  const [selected,setSelected] = useState<Complaint|null>(null);
  const [showForm,setShowForm] = useState(false);
  const [showTracker,setShowTracker] = useState(false);
  const [showInvite,setShowInvite] = useState(false);
  const [trackingCode,setTrackingCode] = useState("");
  const [notice,setNotice] = useState("");
  const [saving,setSaving] = useState(false);
  const [mobileNav,setMobileNav] = useState(false);
  const refresh = async () => { try { const r=await fetch("/api/complaints",{cache:"no-store"}); if (r.ok) setComplaints(await r.json()); } catch {} finally { setLoading(false); } };
  useEffect(() => { void refresh(); }, []);

  const openForm = () => { setPage("Report an issue"); setShowForm(true); };
  const signals = useMemo(() => {
    const grouped = new Map<string,Complaint[]>();
    for (const c of complaints) if (c.signal_id) grouped.set(c.signal_id,[...(grouped.get(c.signal_id) ?? []),c]);
    return [...grouped.entries()].map(([id,items])=>({ id, items, count:items.length, lat:items.reduce((s,c)=>s+c.lat,0)/items.length, lng:items.reduce((s,c)=>s+c.lng,0)/items.length, category:items[0].category, location:items[0].location }));
  },[complaints]);
  const filtered = useMemo(() => complaints.filter(c => {
    const matches = `${c.code} ${c.title} ${c.location} ${c.category} ${c.department}`.toLowerCase().includes(search.toLowerCase());
    return matches && (filter === "All reports" || c.status === filter) && (priorityFilter === "All priorities" || c.priority === priorityFilter);
  }).sort((a,b)=>{
    const priorityOrder:Record<string,number>={Critical:0,High:1,Normal:2,Low:3};
    if(sortMode==="priority")return (priorityOrder[a.priority]??4)-(priorityOrder[b.priority]??4)||new Date(b.created_at).getTime()-new Date(a.created_at).getTime();
    if(sortMode==="oldest")return new Date(a.created_at).getTime()-new Date(b.created_at).getTime();
    return new Date(b.created_at).getTime()-new Date(a.created_at).getTime();
  }),[complaints,search,filter,priorityFilter,sortMode]);
  const active = complaints.filter(c=>c.status!=="Resolved").length;
  const resolved = complaints.filter(c=>c.resident_feedback==="fixed").length;
  const priorityCount = complaints.filter(c=>c.status!=="Resolved"&&(c.priority==="Critical"||c.priority==="High")).length;
  const mapCenter = complaints.length ? {lat:complaints.reduce((sum,c)=>sum+c.lat,0)/complaints.length,lng:complaints.reduce((sum,c)=>sum+c.lng,0)/complaints.length} : {lat:12.2958,lng:76.6394};
  const proofCase = complaints.find(c=>c.status==="Resolved"&&Boolean(c.evidence||c.evidence_url))??null;
  const criticalSignal = [...signals].sort((a,b)=>b.count-a.count)[0];

  async function patchComplaint(code:string, body:Record<string,unknown>) {
    const response=await fetch(`/api/complaints/${code}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not update complaint");
    await refresh(); setSelected(data); return data as Complaint;
  }

  const navItems: {label:NavPage; icon:string}[] = [{label:"Overview",icon:"grid"},{label:"Civic signals",icon:"signal"},{label:"Live map",icon:"map"}];
  return <main className="app-shell">
    <aside className={`sidebar${mobileNav ? " sidebar-open" : ""}`}>
      <div className="brand"><span className="brand-mark"><span/></span><span>JANSETU</span><span className="brand-dot">·</span></div>
      <div className="workspace-label">CITY OPERATIONS</div>
      <div className="ward-select"><span className="ward-dot"/><span><b>City workspace</b><small>All configured areas</small></span><Icon name="down" size={15}/></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="main-nav">
        {navItems.map(item=><button key={item.label} className={`nav-item${page===item.label?" nav-active":""}`} onClick={()=>{setPage(item.label);setMobileNav(false);}}><Icon name={item.icon}/><span>{item.label}</span>{item.label==="Civic signals"&&<span className="nav-count">{signals.length}</span>}</button>)}
        {localDemo&&<button className={`nav-item${page==="Report an issue"?" nav-active":""}`} onClick={openForm}><Icon name="plus"/><span>New report</span><span className="nav-shortcut">N</span></button>}
      </nav>
      <div className="sidebar-bottom">
        <div className="service-card"><div className="service-icon"><Icon name="spark" size={16}/></div><div><b>Priority watch</b><span>{priorityCount} critical or high open reports</span></div><div className="pulse-line"><i/></div></div>
        <button className="help-link" onClick={()=>setShowTracker(true)}><span className="help-avatar">?</span><span><b>Track a report</b><small>Resident portal</small></span><Icon name="arrow" size={15}/></button>
        <a className="sidebar-login-link" href="/login">Resident login</a>
        {!localDemo&&<button className="sidebar-admin-invite" onClick={()=>setShowInvite(true)}>＋ Invite another admin</button>}
        <div className="sidebar-profile"><div className="profile-avatar">{localDemo?"DM":adminEmail.slice(0,2).toUpperCase()}</div><span><b>{localDemo?"Local demo":adminEmail}</b><small>{localDemo?"Demo data · not shared":"City administrator"}</small></span>{localDemo?<a href="/admin/login" className="profile-signout">Sign in</a>:<form action="/auth/logout" method="post"><button aria-label="Sign out" title="Sign out"><Icon name="down" size={14}/></button></form>}</div>
      </div>
    </aside>

    <section className="main-column">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={()=>setMobileNav(!mobileNav)} aria-label="Open navigation"><Icon name="menu"/></button><div className="breadcrumbs"><span>City operations</span><Icon name="chevron" size={13}/><b>{page}</b></div><div className="top-actions">{localDemo&&<span className="demo-banner">LOCAL DEMO · PRIVATE</span>}<span className="live-pill"><i/> {localDemo?"DEMO DATA":"SHARED DATA"}</span><button className="icon-button notification-button" aria-label="Notifications"><Icon name="bell"/><i/></button><div className="top-profile">{adminEmail.slice(0,2).toUpperCase()} <span>{localDemo?"Demo admin":adminEmail}</span></div></div></header>
      <div className="content-wrap">
        <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot"/> CITY OPERATIONS <span className="eyebrow-divider">·</span> GLOBAL QUEUE</div><h1>{page === "Civic signals" ? "Listen to the city." : page === "Live map" ? "See every signal." : "Every report has a route."}<span className="title-period">.</span></h1><p>{page === "Civic signals" ? "When neighbours report the same issue, the signal gets stronger." : "Resolve issues in order of urgency and keep residents informed."}</p></div>{localDemo&&<button className="primary-button" onClick={openForm}><Icon name="plus" size={17}/> New report <span className="button-key">N</span></button>}</section>

        <section className="metric-grid" aria-label="City complaint metrics">
          <Metric label="Open reports" value={active} note="Across all departments" icon="route" tone="blue" trend="↗"/>
          <Metric label="Civic signals" value={signals.length} note="Issues gathering momentum" icon="signal" tone="purple" trend="↗"/>
          <Metric label="Resident confirmed" value={resolved} note="Fixes verified by residents" icon="check" tone="green" trend="This week"/>
          <Metric label="Critical & high" value={priorityCount} note="Sorted at the top of the queue" icon="clock" tone="amber" trend="Auto-priority"/>
        </section>

        {page === "Live map" ? <section className="map-page-grid"><div className="panel large-map-panel"><div className="panel-heading"><div><span className="section-kicker">REPORTED LOCATIONS</span><h2>Report map</h2></div><div className="map-legend"><span><i className="legend-dot roads"/>Roads</span><span><i className="legend-dot waste"/>Waste</span><span><i className="legend-dot water"/>Water</span><span><i className="legend-dot lights"/>Lights</span></div></div><MapsPanel lat={mapCenter.lat} lng={mapCenter.lng} location="Reported issues" markers={complaints}/></div><div className="panel map-list-panel"><PanelTitle eyebrow="LATEST ACTIVITY" title="Around the city" action="View all" onAction={()=>setPage("Overview")}/><div className="mini-list">{complaints.slice(0,6).map(c=><ComplaintRow key={c.code} item={c} onClick={()=>setSelected(c)}/>)}</div></div></section>
        : page === "Civic signals" ? <section className="signals-page"><div className="signal-intro"><div className="signal-intro-icon"><Icon name="signal" size={25}/></div><div><h2>One issue. Many voices.</h2><p>Civic Signals merge nearby reports into a shared issue. As more residents speak up, its urgency rises automatically.</p></div><div className="signal-count-big">{signals.length}<span>active signals</span></div></div><div className="signal-grid">{signals.map((s,i)=><SignalCard key={s.id} signal={s} onClick={()=>setSelected(s.items[0])} index={i}/>)}</div><div className="panel unlinked-panel"><PanelTitle eyebrow="INDIVIDUAL REPORTS" title="Not clustered yet"/><div className="mini-list">{complaints.filter(c=>!c.signal_id).slice(0,5).map(c=><ComplaintRow key={c.code} item={c} onClick={()=>setSelected(c)}/>)}</div></div></section>
        : <section className="dashboard-grid">
          <div className="left-stack">
            <div className="panel signals-panel">
              <PanelTitle eyebrow="CITIZENS SPEAKING TOGETHER" title="Civic signals" action="View all signals" onAction={()=>setPage("Civic signals")}/>
              {criticalSignal ? <SignalCard signal={criticalSignal} onClick={()=>setSelected(criticalSignal.items[0])} featured/> : <div className="empty-inline">No signal clusters yet. New nearby reports will gather here.</div>}
              {signals.length>1&&<div className="signal-peek">{signals.slice(1,3).map(s=><button key={s.id} className="signal-peek-row" onClick={()=>setSelected(s.items[0])}><span className={`category-glyph ${s.category.toLowerCase()}`}>{categoryIcon(s.category)}</span><span><b>{s.items[0].title}</b><small>{s.count} neighbours · {s.location}</small></span><span className="priority-pill">{s.count>2?"Critical":"Rising"}</span></button>)}</div>}
            </div>
            <div className="panel reports-panel"><div className="reports-header"><PanelTitle eyebrow="PRIORITY QUEUE · AUTO-SORTED" title="Latest reports" action="View live map" onAction={()=>setPage("Live map")}/><div className="queue-controls"><select aria-label="Filter by status" value={filter} onChange={e=>setFilter(e.target.value)}>{["All reports",...statusList].map(value=><option key={value}>{value}</option>)}</select><select aria-label="Filter by priority" value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)}>{["All priorities","Critical","High","Normal","Low"].map(value=><option key={value}>{value}</option>)}</select><select aria-label="Sort reports" value={sortMode} onChange={e=>setSortMode(e.target.value)}><option value="priority">Priority first</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></div></div><div className="report-table"><div className="table-head"><span>REPORT</span><span>DEPARTMENT</span><span>PRIORITY / STATUS</span><span>UPDATED</span><span/></div>{filtered.slice(0,8).map(c=><ComplaintRow key={c.code} item={c} onClick={()=>setSelected(c)}/>)}</div><button className="all-reports-link" onClick={()=>setPage("Live map")}>Open full city map <Icon name="arrow" size={14}/></button></div>
          </div>
          <div className="right-stack">
            <div className="panel map-card"><PanelTitle eyebrow={`${complaints.filter(c=>c.status!=="Resolved").length} OPEN CASES`} title="Live city map" action="Explore map" onAction={()=>setPage("Live map")}/><div className="map-visual"><MapsPanel lat={mapCenter.lat} lng={mapCenter.lng} location="Reported issues" markers={complaints} compact/></div><div className="map-summary"><span><i className="legend-dot roads"/>Roads <b>{complaints.filter(c=>c.category==="Roads").length}</b></span><span><i className="legend-dot water"/>Water <b>{complaints.filter(c=>c.category==="Water").length}</b></span><span><i className="legend-dot waste"/>Waste <b>{complaints.filter(c=>c.category==="Waste").length}</b></span></div></div>
            <div className="panel proof-panel">{proofCase?<><div className="proof-top"><span className="proof-icon"><Icon name="image" size={16}/></span><span className="proof-label">FIXPROOF · {proofCase.code}</span><span className="proof-status"><i/>{proofCase.resident_feedback==="fixed"?" RESIDENT CONFIRMED":" AWAITING RESIDENT REVIEW"}</span></div><h3>{proofCase.title}</h3><p>{proofCase.evidence?.startsWith("data:image")?"Resolution photo submitted for resident review.":proofCase.evidence}</p><button className="proof-link" onClick={()=>setSelected(proofCase)}>Review resolution evidence <Icon name="arrow" size={14}/></button></>:<><div className="proof-top"><span className="proof-icon"><Icon name="image" size={16}/></span><span className="proof-label">FIXPROOF</span></div><h3>No repair evidence yet.</h3><p>When a team submits a resolution, its notes and evidence will appear here for resident review.</p></>}</div>
          </div>
        </section>}

        <footer className="footer"><span>JANSETU <i>·</i> A CLEARER WAY TO CARE FOR OUR CITY</span><span>Updates refresh after each action <i className="footer-live"/></span></footer>
      </div>
    </section>

    {showForm&&<ComplaintModal onClose={()=>setShowForm(false)} onCreated={async(c)=>{setShowForm(false);await refresh();setTrackingCode(c.code);setShowTracker(true);setNotice(`Report received · ${c.code}`);setTimeout(()=>setNotice(""),5000);}} setSaving={setSaving} saving={saving}/>}
    {showInvite&&<AdminInviteModal onClose={()=>setShowInvite(false)}/>}
    {showTracker&&<TrackerModal complaints={complaints} initialCode={trackingCode} onClose={()=>{setShowTracker(false);setTrackingCode("");}} onPatch={patchComplaint}/>}
    {selected&&<DetailDrawer item={complaints.find(c=>c.code===selected.code)??selected} onClose={()=>setSelected(null)} onPatch={patchComplaint}/>}
    {notice&&<div className="toast"><span><Icon name="check" size={16}/></span>{notice}</div>}
  </main>;
}

function Metric({label,value,note,icon,tone,trend}:{label:string;value:number;note:string;icon:string;tone:string;trend:string}) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon name={icon}/></span></div><div className="metric-number">{value}<span className="metric-trend">{trend}</span></div><div className="metric-note">{note}</div></div>;
}
function PanelTitle({eyebrow,title,action,onAction}:{eyebrow:string;title:string;action?:string;onAction?:()=>void}) {
  return <div className="panel-title"><div><span className="section-kicker">{eyebrow}</span><h2>{title}</h2></div>{action&&<button className="text-action" onClick={onAction}>{action}<Icon name="arrow" size={14}/></button>}</div>;
}
function ComplaintRow({item,onClick}:{item:Complaint;onClick:()=>void}) {
  return <button className="complaint-row" onClick={onClick}><span className={`category-glyph ${item.category.toLowerCase()}`}>{categoryIcon(item.category)}</span><span className="complaint-main"><b>{item.title}</b><small>{item.code} <i>·</i> {item.location}</small></span><span className="department-cell">{item.department}</span><span className="case-tags"><span className={`priority-label priority-${item.priority.toLowerCase()}`}>{item.priority}</span><StatusTag status={item.status}/></span><span className="updated-cell">{ago(item.updated_at)}<Icon name="chevron" size={14}/></span></button>;
}
function StatusTag({status}:{status:string}) {
  const klass=status.toLowerCase().replaceAll(" ","-");
  return <span className={`status-tag status-${klass}`}><i/>{status}</span>;
}
function SignalCard({signal,onClick,featured=false,index=0}:{signal:{id:string;items:Complaint[];count:number;lat:number;lng:number;category:string;location:string};onClick:()=>void;featured?:boolean;index?:number}) {
  const top=signal.items[0];
  return <button className={`signal-card${featured?" signal-featured":""}`} onClick={onClick}>
    <div className="signal-card-top"><span className={`signal-badge ${signal.count>2?"signal-critical":""}`}><Icon name="signal" size={14}/>{signal.count>2?"STRONG SIGNAL":"RISING SIGNAL"}</span><span className="signal-id">{signal.id}</span></div>
    <div className="signal-card-middle"><span className={`signal-category-icon ${signal.category.toLowerCase()}`}>{categoryIcon(signal.category)}</span><span className="signal-card-copy"><b>{top.title}</b><small><Icon name="pin" size={12}/>{signal.location}</small></span><span className="signal-chevron"><Icon name="chevron" size={17}/></span></div>
    <div className="signal-gather"><div className="gather-avatars">{signal.items.slice(0,4).map((_,i)=><span key={i} className={`gather-avatar g-${(index+i)%4}`}>{["A","M","R","S"][i]}</span>)}{signal.count>4&&<span className="gather-more">+{signal.count-4}</span>}</div><span><b>{signal.count} residents</b> reported this nearby</span><span className="signal-priority">Priority <b>{signal.count>2?"Critical":"High"}</b></span></div>
    {featured&&<div className="signal-surge"><span className="surge-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></span><span><b>Signal strength</b><small>Picking up across Ward 04</small></span><strong>+{Math.max(8,signal.count*8)}%</strong></div>}
  </button>;
}

function AdminInviteModal({onClose}:{onClose:()=>void}) {
  const [email,setEmail]=useState("");const [items,setItems]=useState<Array<{id:string;email:string;status:string;expires_at:string}>>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");
  useEffect(()=>{void fetch("/api/admin/invitations").then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not load invitations.");setItems(data);}).catch(caught=>setError(caught instanceof Error?caught.message:"Could not load invitations."));},[]);
  async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError("");setNotice("");try{const response=await fetch("/api/admin/invitations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not send invitation.");setNotice(data.message);setEmail("");const updated=await fetch("/api/admin/invitations").then(r=>r.json());if(Array.isArray(updated))setItems(updated);}catch(caught){setError(caught instanceof Error?caught.message:"Could not send invitation.");}finally{setBusy(false);}}
  async function revoke(id:string){setError("");try{const response=await fetch("/api/admin/invitations",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not revoke invitation.");setItems(current=>current.map(item=>item.id===id?{...item,status:"revoked"}:item));}catch(caught){setError(caught instanceof Error?caught.message:"Could not revoke invitation.");}}
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title"><div className="modal-topline"><div><span className="section-kicker">ADMIN ACCESS</span><h2 id="invite-title">Invite a teammate</h2><p>They’ll receive a single-use, expiring email invitation.</p></div><button className="close-button" onClick={onClose} aria-label="Close">×</button></div><form onSubmit={submit}><label className="form-label" htmlFor="invite-email">ADMIN EMAIL</label><div className="invite-form-row"><input id="invite-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="staff@city.gov"/><button className="primary-button" disabled={busy}>{busy?"Sending…":"Send invite"}</button></div></form>{error&&<p className="auth-error" role="alert">{error}</p>}{notice&&<p className="auth-success" role="status">{notice}</p>}<div className="invite-list-heading">Recent invitations</div><div className="invite-list">{items.length===0?<p>No invitations yet.</p>:items.map(item=><div key={item.id}><span><b>{item.email}</b><small>{item.status} · expires {new Date(item.expires_at).toLocaleDateString()}</small></span>{item.status==="pending"&&<button onClick={()=>void revoke(item.id)}>Revoke</button>}</div>)}</div></section></div>;
}

function ComplaintModal({onClose,onCreated,setSaving,saving}:{onClose:()=>void;onCreated:(c:Complaint)=>void;setSaving:(v:boolean)=>void;saving:boolean}) {
  const [description,setDescription]=useState("");
  const [title,setTitle]=useState("");
  const [category,setCategory]=useState("Roads");
  const [manualCategory,setManualCategory]=useState<string|null>(null);
  const [priority,setPriority]=useState("Normal");
  const [aiApplied,setAiApplied]=useState(false);
  const [aiSuggestion,setAiSuggestion]=useState<TriageSuggestion|null>(null);
  const [aiBusy,setAiBusy]=useState(false);
  const [aiMessage,setAiMessage]=useState("");
  const [location,setLocation]=useState("");
  const [lat,setLat]=useState(12.2958);
  const [lng,setLng]=useState(76.6394);
  const [locationPinned,setLocationPinned]=useState(false);
  const [reporter,setReporter]=useState("");
  const [photos,setPhotos]=useState<File[]>([]);
  const [recording,setRecording]=useState(false);
  const [recordingSeconds,setRecordingSeconds]=useState(0);
  const [audio,setAudio]=useState<Blob|null>(null);
  const [audioUrl,setAudioUrl]=useState("");
  const [voiceBusy,setVoiceBusy]=useState(false);
  const [mapBusy,setMapBusy]=useState(false);
  const [voiceHint,setVoiceHint]=useState("");
  const [error,setError]=useState("");
  const recorderRef=useRef<MediaRecorder|null>(null);
  const chunksRef=useRef<BlobPart[]>([]);
  const recognitionRef=useRef<any>(null);
  const descriptionRef=useRef("");
  const detectedCategory=useMemo(()=>{
    const text=description.toLowerCase();
    if (/light|lamp|dark|bulb|electric/.test(text)) return "Streetlights";
    if (/water|leak|pipe|drain|pressure|tap/.test(text)) return "Water";
    if (/garbage|waste|rubbish|bin|trash|litter/.test(text)) return "Waste";
    if (/road|pothole|pavement|sidewalk|crack|traffic|street/.test(text)) return "Roads";
    return null;
  },[description]);
  const guess=manualCategory??detectedCategory??category;
  function addPhotos(list:FileList|null){if(!list)return;const chosen=Array.from(list);if(chosen.some(file=>!file.type.startsWith("image/"))){setError("Choose image files only.");return;}if(chosen.some(file=>file.size>5*1024*1024)){setError("Each photo must be 5 MB or smaller.");return;}if(photos.length+chosen.length>3){setError("Attach up to 3 photos per report.");return;}setError("");setPhotos(current=>[...current,...chosen]);}
  useEffect(()=>{ descriptionRef.current=description; },[description]);
  useEffect(()=>{ if(!recording)return; const id=window.setInterval(()=>setRecordingSeconds(s=>s+1),1000);return()=>clearInterval(id); },[recording]);
  useEffect(()=>()=>{ if(audioUrl) URL.revokeObjectURL(audioUrl); if(recognitionRef.current) try{recognitionRef.current.stop();}catch{} },[audioUrl]);
  useEffect(()=>()=>{const recorder=recorderRef.current;if(recorder?.state==="recording"){try{recorder.stop();}catch{}recorder.stream.getTracks().forEach(track=>track.stop());}if(recognitionRef.current)try{recognitionRef.current.stop();}catch{}},[]);
  function applyTranscript(value:string){ if(!value.trim())return; setDescription(prev=>`${prev}${prev.trim()?" ":""}${value.trim()}`);setVoiceHint("Voice added to your complaint. Review and edit before sending."); }
  async function suggestDetails(){
    if(description.trim().length<8){setAiMessage("Add a little more detail before requesting a suggestion.");return;}
    setAiBusy(true);setAiMessage("");
    try{
      const response=await fetch("/api/triage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({description:description.trim()})});
      const data=await response.json();
      if(!response.ok||!data.available||!data.suggestion){setAiSuggestion(null);setAiMessage(data.message||"Gemini is unavailable. Your local suggestion is still ready.");return;}
      setAiSuggestion(data.suggestion);setAiMessage("Suggestion ready. Review it below before applying.");
    }catch{setAiSuggestion(null);setAiMessage("Could not reach Gemini. Your local suggestion is still ready.");}
    finally{setAiBusy(false);}
  }
  function applyAiSuggestion(){
    if(!aiSuggestion)return;
    setTitle(aiSuggestion.title);setCategory(aiSuggestion.category);setManualCategory(aiSuggestion.category);setPriority(aiSuggestion.priority);setAiApplied(true);
    setAiMessage("Suggestion applied. You can still edit the title, category, and priority before sending.");
  }
  async function beginRecord(){
    setError("");setVoiceHint("");setRecordingSeconds(0);chunksRef.current=[];
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const media=new MediaRecorder(stream);
      recorderRef.current=media;
      media.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data);};
      media.onstop=()=>{const blob=new Blob(chunksRef.current,{type:media.mimeType||"audio/webm"});setAudio(blob);setAudioUrl(URL.createObjectURL(blob));stream.getTracks().forEach(t=>t.stop());};
      media.start();setRecording(true);
      const Speech=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
      if(Speech){const recognition=new Speech();recognition.lang="en-IN";recognition.continuous=true;recognition.interimResults=true;let final="";recognition.onresult=(event:any)=>{let interim="";for(let i=event.resultIndex;i<event.results.length;i++){const phrase=event.results[i][0].transcript;if(event.results[i].isFinal)final+=phrase+" ";else interim+=phrase;}setDescription((descriptionRef.current?descriptionRef.current+" ":"")+final+interim);};recognition.onerror=()=>setVoiceHint("Audio is recording. If live captions are unavailable, the recording can still be transcribed with your API key.");recognitionRef.current=recognition;recognition.start();setVoiceHint("Listening and transcribing as you speak…");}
      else setVoiceHint("Recording started. Add a Cloudflare key for transcription, or type the details below.");
    }catch{setError("Allow microphone access to record a voice report. You can still type the details below.");}
  }
  function stopRecord(){ if(recorderRef.current?.state==="recording")recorderRef.current.stop();if(recognitionRef.current)try{recognitionRef.current.stop();}catch{}setRecording(false);setVoiceHint("Recording saved. You can play it back, then transcribe or edit the text."); }
  async function transcribe(){ if(!audio)return;setVoiceBusy(true);setVoiceHint("Transcribing your voice…");try{const f=new FormData();f.append("audio",audio,"voice-report.webm");const r=await fetch("/api/transcribe",{method:"POST",body:f});const d=await r.json();if(d.text){applyTranscript(d.text);}else setVoiceHint(d.message||d.error||"No transcript returned. Add a Cloudflare API token or type the details.");}catch{setVoiceHint("Could not reach transcription. Type or use your browser’s voice input.");}finally{setVoiceBusy(false);} }
  function useLocation(){ if(!navigator.geolocation){setError("Location is not supported in this browser. Enter a nearby address instead.");return;}setVoiceHint("Finding your location…");navigator.geolocation.getCurrentPosition(pos=>{setLat(pos.coords.latitude);setLng(pos.coords.longitude);setLocation("Current location");setLocationPinned(true);setVoiceHint("Location attached to your report.");},()=>{setError("Location permission was not available. Enter a nearby address instead.");setVoiceHint("");},{enableHighAccuracy:true,timeout:8000}); }
  async function pinAddress(){if(!location.trim()){setError("Enter a location first.");return;}setMapBusy(true);setError("");setVoiceHint("Finding that place on the map…");try{const r=await fetch(`/api/geocode?q=${encodeURIComponent(location.trim())}`);const d=await r.json();if(!r.ok)throw new Error(d.error);setLat(d.lat);setLng(d.lng);setLocationPinned(true);setVoiceHint("Map pin added. Location search by OpenStreetMap.");}catch(e){setVoiceHint("");setError(e instanceof Error?e.message:"Could not find that location");}finally{setMapBusy(false);}}
  async function submit(e:React.FormEvent){e.preventDefault();setError("");if(!description.trim()){setError("Tell us what happened before submitting.");return;}if(!location.trim()){setError("Add a location or use your current location.");return;}setSaving(true);try{let reportLat=lat,reportLng=lng;if(!locationPinned){const geo=await fetch(`/api/geocode?q=${encodeURIComponent(location.trim())}`);const point=await geo.json();if(!geo.ok)throw new Error(point.error||"Pin the location or use your current location before sending.");reportLat=point.lat;reportLng=point.lng;}const t=title.trim()||description.trim().split(/[.!?\n]/)[0].slice(0,72)||`${guess} issue`;const finalPriority=aiApplied?priority:(/danger|urgent|injury|flood|sparks/i.test(description)?"High":"Normal");const form=new FormData();form.set("title",t);form.set("description",description.trim());form.set("category",guess);form.set("department",departments[guess]);form.set("priority",finalPriority);form.set("location",location.trim());form.set("lat",String(reportLat));form.set("lng",String(reportLng));form.set("reporter",reporter.trim()||"Resident");photos.forEach(photo=>form.append("photos",photo,photo.name));const r=await fetch("/api/complaints",{method:"POST",body:form});const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not send your report");onCreated(d);}catch(err){setError(err instanceof Error?err.message:"Could not send your report");}finally{setSaving(false);}}
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title"><div className="modal-topline"><div><span className="section-kicker">JANSETU RESIDENT INTAKE · 01 / 01</span><h2 id="report-title">Let’s make it better.</h2><p>Tell us what needs attention. We’ll find the right team.</p></div><button className="close-button" onClick={onClose} aria-label="Close"><Icon name="close"/></button></div>
    <form onSubmit={submit}>
      <div className="voice-card"><div className="voice-card-top"><span className="voice-round"><Icon name="mic" size={20}/></span><span><b>Speak it out</b><small>Talk in your own words. We’ll write it down.</small></span><span className="voice-wave"><i/><i/><i/><i/><i/><i/><i/><i/><i/></span></div>{recording?<button type="button" className="record-button recording" onClick={stopRecord}><span className="record-dot"/>Stop recording <b>00:{String(recordingSeconds).padStart(2,"0")}</b></button>:<button type="button" className="record-button" onClick={beginRecord}><Icon name="mic" size={15}/> Start recording <span>Tap to speak</span></button>}{audioUrl&&<div className="audio-tools"><audio src={audioUrl} controls/><button type="button" className="transcribe-button" disabled={voiceBusy} onClick={transcribe}>{voiceBusy?"Transcribing…":"Transcribe recording"}</button></div>}{voiceHint&&<div className="voice-hint"><Icon name="spark" size={14}/>{voiceHint}</div>}</div>
      <label className="form-label">WHAT HAPPENED <span>required</span></label><textarea className="form-textarea" placeholder="For example: There’s a deep pothole near the bus stop on Market Street…" value={description} onChange={e=>{setDescription(e.target.value);setManualCategory(null);setAiSuggestion(null);setAiApplied(false);}} rows={4}/>
      <div className="ai-action-row"><button className="secondary-button" type="button" onClick={suggestDetails} disabled={aiBusy||description.trim().length<8}><Icon name="spark" size={14}/>{aiBusy?"Preparing suggestion…":"Suggest details with Gemini"}</button><span>Optional · review before applying</span></div>
      {aiMessage&&<div className={`ai-message${aiSuggestion?" ai-message-ready":""}`} role="status">{aiMessage}</div>}
      {aiSuggestion&&<div className="ai-suggestion-card"><div className="ai-suggestion-heading"><b>Gemini suggestion</b><span>{Math.round(aiSuggestion.confidence*100)}% confidence</span></div><p><strong>Summary:</strong> {aiSuggestion.summary}</p><p><strong>Category:</strong> {aiSuggestion.category} · {aiSuggestion.department}</p><p><strong>Suggested priority:</strong> {aiSuggestion.priority}</p><button className="secondary-button" type="button" onClick={applyAiSuggestion}>{aiApplied?"Apply again":"Apply suggestion"}</button><small>AI can be wrong. Check the report details before sending.</small></div>}
      <label className="form-label" htmlFor="complaint-title">COMPLAINT TITLE <span>optional</span></label><input id="complaint-title" className="complaint-title-input" placeholder="A short, clear title" maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/>
      <div className="form-suggestion"><span className="suggestion-spark"><Icon name="spark" size={13}/></span> JANSETU suggests <b>{guess}</b><span>→</span> {departments[guess]}<span className="auto-tag">AUTO-ROUTED</span></div>
      <div className="form-two"><label><span className="form-label">ISSUE TYPE</span><select value={guess} onChange={e=>{setCategory(e.target.value);setManualCategory(e.target.value);}}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label><span className="form-label">YOUR NAME <small>optional</small></span><input placeholder="Stay anonymous" value={reporter} onChange={e=>setReporter(e.target.value)}/></label></div>
      {aiApplied&&<div className="form-two"><label><span className="form-label">SUGGESTED PRIORITY</span><select value={priority} onChange={e=>setPriority(e.target.value)}>{["Critical","High","Normal","Low"].map(value=><option key={value}>{value}</option>)}</select></label><span className="ai-review-note">You control the final priority and category.</span></div>}
      <label className="form-label location-label">WHERE IS IT? <span>required</span></label><div className="location-input"><Icon name="pin" size={17}/><input placeholder="Address, landmark or current location" value={location} onChange={e=>{setLocation(e.target.value);setLocationPinned(false);}}/><button type="button" className="locate-button" onClick={useLocation}><span className="locate-dot"/>Use my location</button></div><div className="location-footnote"><span>Search a pin, or attach your current location.</span><span className="location-actions"><button type="button" onClick={pinAddress} disabled={mapBusy}>{mapBusy?"Finding…":"Pin address"}</button><a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noreferrer">Google Maps <Icon name="arrow" size={12}/></a></span></div>
      <div className="report-map-preview"><MapsPanel lat={lat} lng={lng} location={location||"selected location"} compact interactive onLocationChange={(nextLat,nextLng)=>{setLat(nextLat);setLng(nextLng);setLocationPinned(true);if(!location.trim())setLocation("Selected map location");}}/></div>
      <label className="form-label" htmlFor="complaint-photos">ATTACH PHOTOS <span>optional · up to 3, 5 MB each</span></label><input id="complaint-photos" className="photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple onChange={e=>{addPhotos(e.target.files);e.target.value="";}}/>
      {photos.length>0&&<div className="selected-photos">{photos.map((photo,index)=><span key={`${photo.name}-${index}`}>{photo.name}<button type="button" aria-label={`Remove ${photo.name}`} onClick={()=>setPhotos(current=>current.filter((_,i)=>i!==index))}>×</button></span>)}</div>}
      {error&&<div className="form-error">{error}</div>}
      <div className="modal-footer"><span><Icon name="clock" size={14}/> Every report gets a tracking code</span><button className="primary-button" type="submit" disabled={saving}>{saving?"Sending…":"Send report"}<Icon name="arrow" size={15}/></button></div>
    </form>
  </section></div>;
}

function DetailDrawer({item,onClose,onPatch}:{item:Complaint;onClose:()=>void;onPatch:(code:string,body:Record<string,unknown>)=>Promise<Complaint>}) {
  const [busy,setBusy]=useState(false);const [note,setNote]=useState("");const [evidence,setEvidence]=useState("");const [error,setError]=useState("");const [nextPriority,setNextPriority]=useState(item.priority);const [priorityReason,setPriorityReason]=useState("");
  const updates=parseUpdates(item.updates);
  async function save(body:Record<string,unknown>){setBusy(true);setError("");try{await onPatch(item.code,body);}catch(e){setError(e instanceof Error?e.message:"Could not save update");}finally{setBusy(false);}}
  function readEvidence(file:File|undefined){if(!file)return;const reader=new FileReader();reader.onload=()=>setEvidence(String(reader.result));reader.readAsDataURL(file);}
  return <div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><aside className="detail-drawer"><div className="drawer-header"><div><span className="section-kicker">COMPLAINT · {item.code}</span><h2>Case detail</h2></div><button className="close-button" onClick={onClose} aria-label="Close"><Icon name="close"/></button></div><div className="drawer-scroll"><div className="detail-title-row"><span className={`category-glyph ${item.category.toLowerCase()}`}>{categoryIcon(item.category)}</span><div><h3>{item.title}</h3><p>{item.description}</p></div></div><div className="detail-badges"><StatusTag status={item.status}/><span className={`priority-pill ${item.priority.toLowerCase()}`}>{item.priority} priority</span>{item.signal_id&&<span className="signal-id">{item.signal_id}</span>}</div><div className="detail-facts"><div><small>ASSIGNED TO</small><b><span className="dept-dot"/> {item.department}</b></div><div><small>REPORTED</small><b>{ago(item.created_at)} · {item.reporter}</b></div></div>{parsePhotoUrls(item.photo_urls).length>0&&<div className="complaint-photo-gallery">{parsePhotoUrls(item.photo_urls).map((src,index)=><img key={`${item.code}-photo-${index}`} src={src} alt={`Resident attachment ${index+1} for ${item.code}`}/>)}</div>}<div className="detail-location"><div className="detail-section-head"><span className="section-kicker">LOCATION</span><a href={`https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`} target="_blank" rel="noreferrer">Open Google Maps <Icon name="arrow" size={12}/></a></div><p><Icon name="pin" size={14}/>{item.location}</p><MapsPanel lat={item.lat} lng={item.lng} location={item.location} compact/></div>
    <div className="status-update-box"><div className="detail-section-head"><span className="section-kicker">STAFF ACTION</span></div><label className="form-label">UPDATE STATUS</label><select className="staff-select" value={item.status} onChange={e=>void save({status:e.target.value})} disabled={busy}>{statusList.map(s=><option key={s}>{s}</option>)}</select><label className="form-label">REVIEW PRIORITY</label><select className="staff-select" value={nextPriority} onChange={e=>setNextPriority(e.target.value)}>{["Critical","High","Normal","Low"].map(value=><option key={value}>{value}</option>)}</select>{nextPriority!==item.priority&&<><label className="form-label">REASON FOR OVERRIDE</label><textarea className="form-textarea small-textarea" placeholder="Explain why the automatic priority should change" value={priorityReason} onChange={e=>setPriorityReason(e.target.value)} rows={2}/><button className="secondary-button full-button" disabled={busy||priorityReason.trim().length<8} onClick={()=>{void save({priority:nextPriority,priorityReason:priorityReason.trim()});setPriorityReason("");}}>Save priority override</button></>}<label className="form-label">ADD AN UPDATE</label><textarea className="form-textarea small-textarea" placeholder="Crew assigned, parts ordered, access needed…" value={note} onChange={e=>setNote(e.target.value)} rows={2}/><button className="secondary-button full-button" disabled={busy||!note.trim()} onClick={()=>{void save({note:note.trim()});setNote("");}}>Add to resolution trail <Icon name="arrow" size={14}/></button></div>
    <div className="fixproof-box"><div className="fixproof-heading"><span className="proof-icon"><Icon name="image" size={16}/></span><div><b>FixProof</b><small>Show the work. Close the loop.</small></div></div>{(item.evidence||item.evidence_url)&&<div className="evidence-existing">{item.evidence_url?<img src={item.evidence_url} alt="Resolution evidence photo"/>:item.evidence?.startsWith("data:image")?<img src={item.evidence} alt="Resolution evidence"/>:<p><Icon name="check" size={14}/>{item.evidence}</p>}</div>}<label className="upload-drop"><Icon name="upload" size={16}/><span>{evidence?"Photo attached":"Attach a photo or note"}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={e=>readEvidence(e.target.files?.[0])}/></label>{evidence&&<button className="secondary-button full-button" disabled={busy} onClick={()=>{void save({evidence});setEvidence("");}}>Attach resolution proof <Icon name="check" size={14}/></button>}</div>
    <div className="timeline"><div className="detail-section-head"><span className="section-kicker">RESOLUTION TRAIL</span><span className="timeline-count">{updates.length} EVENTS</span></div>{updates.slice().reverse().map((u,i)=><div className="timeline-item" key={`${u.at}-${i}`}><span className={`timeline-dot${i===0?" latest":""}`}/><div><b>{u.text}</b><small>{u.by} <i>·</i> {ago(u.at)}</small></div></div>)}</div>
    {item.status==="Resolved"&&<div className="resident-confirm"><span><Icon name="check" size={15}/></span><div><b>Did we fix it?</b><small>Your answer keeps JANSETU accountable.</small></div><div className="confirm-actions"><button onClick={()=>void save({feedback:"fixed"})} disabled={busy}>Fixed ✓</button><button onClick={()=>void save({feedback:"still_broken"})} disabled={busy}>Still broken</button></div></div>}{error&&<div className="form-error">{error}</div>}</div></aside></div>;
}

function TrackerModal({complaints,initialCode,onClose,onPatch}:{complaints:Complaint[];initialCode:string;onClose:()=>void;onPatch:(code:string,body:Record<string,unknown>)=>Promise<Complaint>}) {
  const [code,setCode]=useState(initialCode);const [item,setItem]=useState<Complaint|null>(complaints.find(c=>c.code===initialCode)??null);const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  useEffect(()=>{setCode(initialCode);setItem(complaints.find(c=>c.code===initialCode)??null);},[initialCode,complaints]);
  const lookup=(e:React.FormEvent)=>{e.preventDefault();const match=complaints.find(c=>c.code.toLowerCase()===code.trim().toLowerCase());setItem(match??null);setError(match?"":"We couldn’t find that code. Check it and try again.");};
  async function feedback(value:string){if(!item)return;setBusy(true);try{const updated=await onPatch(item.code,{feedback:value});setItem(updated);}catch(e){setError(e instanceof Error?e.message:"Could not save your feedback");}finally{setBusy(false);}}
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className={`tracker-modal${item?" tracker-has-item":""}`} role="dialog" aria-modal="true"><div className="modal-topline"><div><span className="section-kicker">JANSETU RESIDENT PORTAL</span><h2>It’s your city. Stay in the loop.</h2><p>Enter your tracking code to follow the people working on it.</p></div><button className="close-button" onClick={onClose} aria-label="Close"><Icon name="close"/></button></div><form className="tracker-search" onSubmit={lookup}><Icon name="search" size={18}/><input placeholder="Your tracking code · e.g. PY-2048" value={code} onChange={e=>setCode(e.target.value)}/><button className="primary-button">Find my report <Icon name="arrow" size={14}/></button></form>{error&&<div className="form-error">{error}</div>}{item&&<div className="tracker-result"><div className="tracker-case-top"><div><span className="section-kicker">CASE {item.code}</span><h3>{item.title}</h3></div><StatusTag status={item.status}/></div><p className="tracker-location"><Icon name="pin" size={14}/>{item.location}<span>·</span>{item.department}</p><div className="progress-track"><span className={`progress-step${item.status!=="Received"?" done":" current"}`}><i/><b>Received</b></span><span className={`progress-step${["Assigned","In progress","Resolved"].includes(item.status)?" done":""}`}><i/><b>Assigned</b></span><span className={`progress-step${["In progress","Resolved"].includes(item.status)?" done":""}`}><i/><b>In progress</b></span><span className={`progress-step${item.status==="Resolved"?" done":""}`}><i/><b>Resolved</b></span></div><div className="tracker-timeline">{parseUpdates(item.updates).slice().reverse().map((u,i)=><div className="timeline-item" key={`${u.at}-${i}`}><span className={`timeline-dot${i===0?" latest":""}`}/><div><b>{u.text}</b><small>{u.by} <i>·</i> {ago(u.at)}</small></div></div>)}</div>{item.status==="Resolved"&&<div className="resident-confirm"><span><Icon name="check" size={15}/></span><div><b>Is it fixed for you?</b><small>Your feedback can reopen this case.</small></div><div className="confirm-actions"><button onClick={()=>void feedback("fixed")} disabled={busy}>Yes, fixed</button><button onClick={()=>void feedback("still_broken")} disabled={busy}>Still broken</button></div></div>}</div>}</section></div>;
}
