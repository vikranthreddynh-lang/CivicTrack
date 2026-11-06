export type PriorityInput={severity?:number;communityImpact?:number;repeatReports?:number;aiSafetySignal?:boolean;humanVerifiedSafety?:boolean};
export function calculatePriority(input:PriorityInput){
  const severity=Math.max(0,Math.min(1,input.severity??0.2));
  const impact=Math.max(0,Math.min(100,input.communityImpact??0));
  const repeats=Math.max(0,Math.min(5,input.repeatReports??0));
  const score=Math.min(100,Math.round(severity*48+impact*.27+Math.min(20,repeats*4)+(input.aiSafetySignal?10:0)+(input.humanVerifiedSafety?20:0)));
  // P0 remains a human declaration; an AI safety signal only triggers review.
  const priority=input.humanVerifiedSafety||score>=72?"p1":score>=43?"p2":"p3";
  return {score,priority,reasons:[{factor:"severity",value:severity,weight:48},{factor:"community_impact",value:impact,weight:27},{factor:"repeat_reports",value:repeats,weight:4},{factor:"ai_safety_signal",value:Boolean(input.aiSafetySignal),weight:10},{factor:"human_verified_safety",value:Boolean(input.humanVerifiedSafety),weight:20}],requiresHumanReview:Boolean(input.aiSafetySignal)};
}
