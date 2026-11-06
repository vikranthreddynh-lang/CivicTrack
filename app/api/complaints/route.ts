import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { addComplaint, listComplaints } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/supabase/auth-context";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const departments: Record<string,string> = { Roads:"Roads & Mobility", Waste:"Sanitation", Water:"Water Works", Streetlights:"Electrical Services" };
const validCategories = new Set(Object.keys(departments));
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const photoLimit = 5 * 1024 * 1024;

function automaticPriority(description: string, nearbyReports = 0) {
  const text = description.toLowerCase();
  if (/fallen (power )?line|live wire|electrocution|building collapse|person (is )?injured|fire|gas leak|open manhole|road cave.?in|flood(ed|ing) (home|house|school)/.test(text)) return "Critical";
  if (/urgent|danger(ous)?|sparks|injur|overflow|burst pipe|sewage|heavy flood|traffic hazard|blocked drain/.test(text)) return "High";
  if (nearbyReports >= 2) return "High";
  return "Normal";
}

function trackingCode() { return `JS-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0,4).toUpperCase()}`; }

async function readPayload(request: Request) {
  if (request.headers.get("content-type")?.includes("application/json")) {
    const body = await request.json();
    return { value: (key:string) => body?.[key], photos: [] as File[] };
  }
  const form = await request.formData();
  return { value: (key:string) => form.get(key), photos: form.getAll("photos").filter((item):item is File => item instanceof File) };
}

async function validatedInput(request: Request) {
  const payload = await readPayload(request);
  const getText = (key:string) => String(payload.value(key) ?? "").trim();
  const title = getText("title").slice(0,120);
  const description = getText("description");
  const category = getText("category");
  const location = getText("location").slice(0,500);
  const lat = Number(getText("lat"));
  const lng = Number(getText("lng"));
  if (description.length < 8 || description.length > 5000 || !validCategories.has(category) || !location || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error("Add a clear issue description, supported category, and valid location to continue.");
  }
  const photos = payload.photos;
  if (photos.length > 3) throw new Error("Attach up to 3 photos per report.");
  if (photos.some(file => !allowedPhotoTypes.has(file.type) || file.size > photoLimit)) throw new Error("Each photo must be a JPEG, PNG, WebP, or HEIC image no larger than 5 MB.");
  return { title: title || description.split(/[.!?\n]/)[0].slice(0,100) || `${category} issue`, description, category, department:departments[category], location, lat, lng, reporter:getText("reporter").slice(0,100) || "Resident", photos };
}

async function signedPhotoUrls(supabase:NonNullable<Awaited<ReturnType<typeof getCurrentUserContext>>["supabase"]>, paths:string[]) {
  if (!paths?.length) return [];
  const { data } = await supabase.storage.from("complaint-photos").createSignedUrls(paths, 3600);
  return (data ?? []).map(item=>item.signedUrl).filter((url):url is string=>Boolean(url));
}

export async function GET() {
  if (!getSupabaseConfig()) {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Shared database is not configured. Contact the JANSETU deployment administrator." }, { status: 503 });
    return NextResponse.json(listComplaints());
  }
  const { user, supabase } = await getCurrentUserContext();
  if (!supabase || !user) return NextResponse.json({ error: "Sign in to view complaints." }, { status: 401 });
  const { data, error } = await supabase.from("complaints").select("*").order("created_at", { ascending:false }).limit(500);
  if (error) return NextResponse.json({ error: "Could not load complaints." }, { status: 500 });
  const mapped = await Promise.all((data ?? []).map(async row=>({
    ...row,
    id:row.id,
    code:row.tracking_code,
    photo_urls:await signedPhotoUrls(supabase,row.photo_paths ?? []),
    evidence_url:row.evidence_path?(await supabase.storage.from("complaint-photos").createSignedUrl(row.evidence_path,3600)).data?.signedUrl??null:null,
  })));
  return NextResponse.json(mapped);
}

export async function POST(request: Request) {
  if(Number(request.headers.get("content-length")??0)>16*1024*1024)return NextResponse.json({error:"The report upload is too large. Attach no more than 3 photos up to 5 MB each."},{status:413});
  if (!getSupabaseConfig()) {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Shared database is not configured. Report submission is unavailable until the deployment is connected to Supabase." }, { status: 503 });
    try {
      const input = await validatedInput(request);
      const encodedPhotos = await Promise.all(input.photos.map(async file=>`data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`));
      const result = addComplaint({ ...input, priority:automaticPriority(input.description), photo_urls:JSON.stringify(encodedPhotos) });
      return NextResponse.json(result, { status:201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save this complaint.";
      return NextResponse.json({ error:message }, { status:400 });
    }
  }

  const { user, role, supabase } = await getCurrentUserContext();
  if (!supabase || !user) return NextResponse.json({ error:"Sign in as a resident before reporting an issue." }, { status:401 });
  if (role === "admin") return NextResponse.json({ error:"Use the resident account to submit a public report." }, { status:403 });
  const uploadedPaths:string[]=[];
  try {
    const input = await validatedInput(request);
    const latitudeRange = 600 / 111_000;
    const longitudeRange = latitudeRange / Math.max(0.25, Math.cos(input.lat * Math.PI / 180));
    const { data:nearby } = await supabase.from("complaints").select("lat,lng").eq("category",input.category).neq("status","Resolved").gte("lat",input.lat-latitudeRange).lte("lat",input.lat+latitudeRange).gte("lng",input.lng-longitudeRange).lte("lng",input.lng+longitudeRange).limit(200);
    const radians=(value:number)=>value*Math.PI/180;
    const nearbyCount=(nearby??[]).filter(point=>{
      const a=radians(point.lat-input.lat),b=radians(point.lng-input.lng);
      const h=Math.sin(a/2)**2+Math.cos(radians(input.lat))*Math.cos(radians(point.lat))*Math.sin(b/2)**2;
      return 6_371_000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))<=600;
    }).length;
    const priority=automaticPriority(input.description,nearbyCount);
    for(const photo of input.photos){
      const extension=photo.type==="image/jpeg"?"jpg":photo.type.split("/")[1];
      const path=`${user.id}/${randomUUID()}.${extension}`;
      const { error:uploadError }=await supabase.storage.from("complaint-photos").upload(path,photo,{contentType:photo.type,upsert:false});
      if(uploadError)throw new Error("Photo upload failed. Retry or remove the photo and submit the report.");
      uploadedPaths.push(path);
    }
    const code=trackingCode();
    const now=new Date().toISOString();
    const { data:created,error:insertError }=await supabase.from("complaints").insert({
      tracking_code:code,resident_id:user.id,title:input.title,description:input.description,category:input.category,department:input.department,priority,
      location:input.location,lat:input.lat,lng:input.lng,reporter:input.reporter,photo_paths:uploadedPaths,
      updates:[{at:now,text:`Complaint received and routed to ${input.department}.`,by:"JANSETU triage"}],
    }).select("*").single();
    if(insertError)throw new Error("Could not save the report to the shared database.");
    await supabase.from("audit_logs").insert({actor_id:user.id,action:"complaint_created",entity_type:"complaint",entity_id:created.id,details:{category:input.category,priority}});
    return NextResponse.json({...created,code:created.tracking_code,photo_urls:await signedPhotoUrls(supabase,uploadedPaths)}, {status:201});
  } catch(error) {
    if(uploadedPaths.length)await supabase.storage.from("complaint-photos").remove(uploadedPaths);
    const message=error instanceof Error?error.message:"Could not save the complaint.";
    return NextResponse.json({error:message},{status:message.startsWith("Add a clear")||message.startsWith("Attach")||message.startsWith("Each photo")?400:500});
  }
}
