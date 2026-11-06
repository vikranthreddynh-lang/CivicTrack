import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { updateComplaint } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/supabase/auth-context";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const statuses=["Received","Assigned","In progress","Resolved"];
const priorities=["Critical","High","Normal","Low"];

export async function PATCH(request: Request, context: { params: Promise<{ code: string }> }) {
  if(Number(request.headers.get("content-length")??0)>7*1024*1024)return NextResponse.json({error:"This update is too large."},{status:413});
  const { code } = await context.params;
  if(!getSupabaseConfig()){
    if(process.env.NODE_ENV==="production")return NextResponse.json({error:"Shared database is not configured."},{status:503});
    try{const body=await request.json();if(body.status&&!statuses.includes(body.status))return NextResponse.json({error:"Unknown complaint status."},{status:400});const result=updateComplaint(code,body);if(!result)return NextResponse.json({error:"Complaint not found."},{status:404});return NextResponse.json(result);}
    catch{return NextResponse.json({error:"Could not update this complaint."},{status:500});}
  }

  const {user,role,supabase}=await getCurrentUserContext();
  if(!supabase||!user)return NextResponse.json({error:"Sign in to update this report."},{status:401});
  let body:Record<string,unknown>;
  try{body=await request.json();}catch{return NextResponse.json({error:"Invalid update request."},{status:400});}
  const feedback=body.feedback;
  if(role==="resident"){
    if((feedback!=="fixed"&&feedback!=="still_broken")||Object.keys(body).some(key=>key!=="feedback"))return NextResponse.json({error:"Residents can only submit resolution feedback on their own report."},{status:403});
    const {error}=await supabase.rpc("submit_resolution_feedback",{p_tracking_code:code,p_feedback:feedback});
    if(error)return NextResponse.json({error:"This report is not owned by your account or is not awaiting resolution feedback."},{status:404});
  }else{
    if(feedback)return NextResponse.json({error:"Only the reporting resident can confirm a fix."},{status:403});
    if(body.status&&!statuses.includes(String(body.status)))return NextResponse.json({error:"Unknown complaint status."},{status:400});
    if(body.priority&&!priorities.includes(String(body.priority)))return NextResponse.json({error:"Unknown priority."},{status:400});
    const {data:existing,error:lookupError}=await supabase.from("complaints").select("*").eq("tracking_code",code).maybeSingle();
    if(lookupError||!existing)return NextResponse.json({error:"Complaint not found."},{status:404});
    const now=new Date().toISOString();
    const events=Array.isArray(existing.updates)?existing.updates:[];
    const added:Array<{at:string;text:string;by:string}>=[];
    if(body.status&&body.status!==existing.status)added.push({at:now,text:`Status updated to ${body.status}.`,by:user.email??"City staff"});
    if(typeof body.note==="string"&&body.note.trim())added.push({at:now,text:body.note.trim().slice(0,1000),by:user.email??"City staff"});
    if(typeof body.evidence==="string"&&body.evidence.trim())added.push({at:now,text:"FixProof evidence added for resident review.",by:user.email??"City staff"});
    if(body.priority&&body.priority!==existing.priority){
      const reason=typeof body.priorityReason==="string"?body.priorityReason.trim():"";
      if(reason.length<8)return NextResponse.json({error:"Add a short reason when changing the recommended priority."},{status:400});
      added.push({at:now,text:`Priority changed from ${existing.priority} to ${body.priority}: ${reason}`,by:user.email??"City staff"});
    }
    const update:Record<string,unknown>={updated_at:now,updates:[...events,...added]};
    if(body.status)update.status=body.status;
    if(body.priority)update.priority=body.priority;
    let uploadedEvidencePath:string|undefined;
    let evidenceText:string|undefined;
    if(typeof body.evidence==="string"&&body.evidence.trim()){
      const dataUrl=body.evidence.match(/^data:(image\/(?:jpeg|png|webp|heic));base64,([A-Za-z0-9+/=]+)$/);
      if(dataUrl){
        const buffer=Buffer.from(dataUrl[2],"base64");
        if(buffer.byteLength>5*1024*1024)return NextResponse.json({error:"Resolution photos must be 5 MB or smaller."},{status:400});
        const extension=dataUrl[1]==="image/jpeg"?"jpg":dataUrl[1].split("/")[1];
        uploadedEvidencePath=`${user.id}/fixproof/${randomUUID()}.${extension}`;
        const {error:uploadError}=await supabase.storage.from("complaint-photos").upload(uploadedEvidencePath,buffer,{contentType:dataUrl[1],upsert:false});
        if(uploadError)return NextResponse.json({error:"Could not upload FixProof evidence."},{status:500});
        evidenceText="Resolution photo submitted for resident review.";
        update.evidence_path=uploadedEvidencePath;
      }else evidenceText=body.evidence.trim().slice(0,5000);
      update.evidence=evidenceText;
    }
    const {error:updateError}=await supabase.from("complaints").update(update).eq("id",existing.id);
    if(updateError){if(uploadedEvidencePath)await supabase.storage.from("complaint-photos").remove([uploadedEvidencePath]);return NextResponse.json({error:"Could not save the complaint update."},{status:500});}
    if(added.length)await supabase.from("complaint_updates").insert(added.map(event=>({complaint_id:existing.id,actor_id:user.id,actor_role:"admin",update_type:event.text.startsWith("Status")?"status":"staff_update",body:event.text})));
    await supabase.from("audit_logs").insert({actor_id:user.id,action:"complaint_updated",entity_type:"complaint",entity_id:existing.id,details:{status:update.status??existing.status,priority:update.priority??existing.priority}});
  }

  const {data:row,error:readError}=await supabase.from("complaints").select("*").eq("tracking_code",code).maybeSingle();
  if(readError||!row)return NextResponse.json({error:"Could not reload the complaint."},{status:500});
  const photoPaths=(row.photo_paths??[]) as string[];
  const {data:photoData}=photoPaths.length?await supabase.storage.from("complaint-photos").createSignedUrls(photoPaths,3600):{data:[]};
  const {data:evidenceData}=row.evidence_path?await supabase.storage.from("complaint-photos").createSignedUrl(row.evidence_path,3600):{data:null};
  return NextResponse.json({...row,code:row.tracking_code,photo_urls:(photoData??[]).map(item=>item.signedUrl).filter(Boolean),evidence_url:evidenceData?.signedUrl??null});
}
