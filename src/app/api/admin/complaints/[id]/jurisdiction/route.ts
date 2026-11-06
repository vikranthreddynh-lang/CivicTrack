import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({ departmentId:z.string().uuid(), wardId:z.string().uuid(), reason:z.string().trim().min(8).max(500) });
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 const{id}=await context.params;const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Choose a department, ward, and correction reason."},{status:400});
 const supabase=await createSupabaseServerClient();if(!supabase)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const{data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Sign-in required."},{status:401});
 const{data:profile}=await supabase.from("profiles").select("role,department_id,ward_id").eq("id",user.id).maybeSingle();
 if(!profile||!["super_admin","department_admin","ward_admin"].includes(profile.role))return NextResponse.json({error:"Not authorized."},{status:403});
 if(profile.role==="department_admin"&&profile.department_id!==parsed.data.departmentId)return NextResponse.json({error:"You can only assign complaints within your department."},{status:403});
 if(profile.role==="ward_admin"&&profile.ward_id!==parsed.data.wardId)return NextResponse.json({error:"You can only assign complaints within your ward."},{status:403});
 const{data:complaint}=await supabase.from("complaints").select("id,department_id,ward_id,jurisdiction_rationale").eq("id",id).maybeSingle();if(!complaint)return NextResponse.json({error:"Complaint not found or outside your access."},{status:404});
 const{error}=await supabase.from("complaints").update({department_id:parsed.data.departmentId,ward_id:parsed.data.wardId,jurisdiction_rationale:`Manual staff correction: ${parsed.data.reason}`,jurisdiction_evidence:{type:"human_override",actor:user.id,reason:parsed.data.reason,previous_department:complaint.department_id,previous_ward:complaint.ward_id}}).eq("id",id);
 if(error)return NextResponse.json({error:"Could not update jurisdiction."},{status:503});
 await supabase.from("audit_logs").insert({actor_id:user.id,action:"complaint.jurisdiction_corrected",entity_type:"complaint",entity_id:id,reason:parsed.data.reason,metadata:{previous_department:complaint.department_id,previous_ward:complaint.ward_id,department:parsed.data.departmentId,ward:parsed.data.wardId}});
 return NextResponse.json({ok:true});
}
