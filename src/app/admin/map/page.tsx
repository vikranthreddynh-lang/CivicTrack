import { redirect } from "next/navigation";
import LiveMap from "@/components/live-map";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const instant=false;
export default async function AdminMapPage(){const supabase=await createSupabaseServerClient();if(!supabase)redirect("/admin/login");const{data:{user}}=await supabase.auth.getUser();if(!user)redirect("/admin/login");const{data:profile}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();if(!profile)redirect("/admin/login");return <LiveMap/>;}
