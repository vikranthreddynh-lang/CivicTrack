import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";

export async function POST(request:NextRequest){
 if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:"Unauthorized."},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);if(!url||!key)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const supabase=createClient(url,key,{auth:{persistSession:false}});const{data:setting}=await supabase.from("system_settings").select("value").eq("key","privacy_policy").maybeSingle();
 const retentionDays=Number(setting?.value?.retention_days);if(!Number.isInteger(retentionDays)||retentionDays<30)return NextResponse.json({error:"Configure a retention period of at least 30 days."},{status:409});
 const cutoff=new Date(Date.now()-retentionDays*86400000).toISOString();const{data:expired,error}=await supabase.from("complaints").select("id").in("status",["closed","verified"]).lt("updated_at",cutoff).limit(200);if(error)return NextResponse.json({error:"Could not locate expired records."},{status:503});
 let deleted=0;let failed=0;
 for(const item of expired??[]){
  const[{data:media},{data:evidence}]=await Promise.all([supabase.from("complaint_media").select("object_path").eq("complaint_id",item.id),supabase.from("resolution_evidence").select("object_path").eq("complaint_id",item.id)]);
  const paths=[...(media??[]),...(evidence??[])].map(row=>row.object_path);
  if(paths.length){const{error:storageError}=await supabase.storage.from("complaint-originals").remove(paths);if(storageError){failed++;continue;}}
  const{error:deleteError}=await supabase.from("complaints").delete().eq("id",item.id);if(deleteError){failed++;continue;}deleted++;
 }
 if(deleted)await supabase.from("audit_logs").insert({action:"privacy.retention_purge",entity_type:"complaint_batch",reason:`Removed ${deleted} resolved complaint records past configured ${retentionDays}-day retention.`,metadata:{deleted,retention_days:retentionDays}});
 return NextResponse.json({deleted,failed,retentionDays});
}
