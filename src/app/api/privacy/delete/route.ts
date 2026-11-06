import {createHash} from "node:crypto";
import {NextRequest,NextResponse}from"next/server";
import{createClient}from"@supabase/supabase-js";
import{z}from"zod";
import{consumeRateLimit}from"@/lib/rate-limit";
import{trackingCodePattern}from"@/lib/complaint-validation";

const schema=z.object({trackingCode:z.string().refine(value=>trackingCodePattern.test(value))});
export async function POST(request:NextRequest){
 const ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown";try{if(!(await consumeRateLimit(ip,"privacy-delete",3)))return NextResponse.json({error:"Too many requests. Try again later."},{status:429});}catch{return NextResponse.json({error:"Request protection is temporarily unavailable."},{status:503});}
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Enter your complaint tracking code."},{status:400});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);if(!url||!key)return NextResponse.json({error:"Deletion is unavailable until secure server storage is configured."},{status:503});
 const supabase=createClient(url,key,{auth:{persistSession:false}});const hash=createHash("sha256").update(parsed.data.trackingCode.toUpperCase()).digest("hex");
 const{data:complaint}=await supabase.from("complaints").select("id").eq("tracking_code_hash",hash).maybeSingle();if(!complaint)return NextResponse.json({error:"No complaint was found for that tracking code."},{status:404});
 const[{data:media},{data:evidence}]=await Promise.all([supabase.from("complaint_media").select("object_path").eq("complaint_id",complaint.id),supabase.from("resolution_evidence").select("object_path").eq("complaint_id",complaint.id)]);const paths=[...(media??[]),...(evidence??[])].map(item=>item.object_path);
 if(paths.length){const{error:storageError}=await supabase.storage.from("complaint-originals").remove(paths);if(storageError)return NextResponse.json({error:"Could not remove stored media. The complaint was left intact."},{status:503});}
 const{error}=await supabase.from("complaints").delete().eq("id",complaint.id);if(error)return NextResponse.json({error:"Could not delete the report. Please contact the municipality."},{status:503});
 await supabase.from("audit_logs").insert({action:"privacy.resident_deletion",entity_type:"complaint",reason:"Resident requested erasure using the private tracking code."});return NextResponse.json({ok:true});
}
