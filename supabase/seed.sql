-- Synthetic local-only fixtures. These are not municipal records.
insert into public.departments(name) values
('[DEMO] Roads'),('[DEMO] Water'),('[DEMO] Drainage'),('[DEMO] Sanitation'),('[DEMO] Streetlights') on conflict(name) do nothing;

insert into public.wards(name,ward_code,municipality,boundary)
values('[DEMO] Central Ward','DEMO-01','[DEMO] Municipality',extensions.ST_Multi(extensions.ST_GeomFromText('POLYGON((77.58 12.96,77.62 12.96,77.62 12.99,77.58 12.99,77.58 12.96))',4326)))
on conflict(ward_code) do nothing;

insert into public.jurisdictions(ward_id,department_id,service_category,boundary,source,source_date,coverage_percent)
select w.id,d.id,'Roads',w.boundary,'Synthetic local demo fixture','2026-11-06',100
from public.wards w cross join public.departments d where w.ward_code='DEMO-01' and d.name='[DEMO] Roads'
on conflict do nothing;

insert into public.dataset_catalog(dataset_key,title,source,source_date,coverage,coverage_percent,notes)
values('demo-assets','[DEMO] Nearby municipal assets','Synthetic local demo fixture','2026-11-06',
extensions.ST_Multi(extensions.ST_GeomFromText('POLYGON((77.58 12.96,77.62 12.96,77.62 12.99,77.58 12.99,77.58 12.96))',4326)),100,
'Synthetic test locations only; not representative of real civic infrastructure.') on conflict(dataset_key) do nothing;

insert into public.infrastructure_assets(asset_type,label,location,dataset_id,attributes)
select v.asset_type,v.label,extensions.ST_SetSRID(extensions.ST_Point(v.lng,v.lat),4326),d.id,v.attributes::jsonb
from (values
('hospital','[DEMO] Sample clinic',77.596,12.973,'{}'),
('school','[DEMO] Sample school',77.601,12.974,'{}'),
('road','[DEMO] Sample arterial road',77.598,12.971,'{}'),
('population_estimate','[DEMO] Sample population grid',77.599,12.972,'{"estimated_population":1200}')
) as v(asset_type,label,lng,lat,attributes)
cross join public.dataset_catalog d where d.dataset_key='demo-assets';

insert into public.sla_policies(category,priority,assignment_hours,response_hours,resolution_hours)
select c,p,case p when 'p0' then 1 when 'p1' then 4 when 'p2' then 24 else 72 end,
case p when 'p0' then 1 when 'p1' then 4 when 'p2' then 12 else 24 end,
case p when 'p0' then 4 when 'p1' then 24 when 'p2' then 72 else 168 end
from unnest(array['Roads','Water','Drainage','Sanitation','Streetlights','Public safety','Other']) c
cross join unnest(array['p0','p1','p2','p3']) p
on conflict(category,priority) do nothing;

with ward as(select id from public.wards where ward_code='DEMO-01'), rows as (
  insert into public.complaints(tracking_code_hash,title,description,category,address_text,location,ward_id,department_id,jurisdiction_rationale,jurisdiction_evidence,status,priority,processing_status,ai_consent,media_consent,source)
  select encode(extensions.digest(v.code,'sha256'),'hex'),v.title,v.description,v.category,'[DEMO] Central Ward',extensions.ST_SetSRID(extensions.ST_Point(v.lng,v.lat),4326),ward.id,dept.id,
  'Synthetic local fixture falls within the demo boundary.',jsonb_build_object('source','Synthetic local demo fixture','coverage_percent',100),v.status,v.priority,'manual_review',false,false,'local_seed'
  from (values
   ('JS-0000000001','[DEMO] Sample pothole','Synthetic test report for the local development environment.','Roads','p1','in_progress',77.596,12.973),
   ('JS-0000000002','[DEMO] Repeat road damage','Synthetic test report for recurrence testing near the first sample.','Roads','p2','assigned',77.5962,12.9731),
   ('JS-0000000003','[DEMO] Sample streetlight outage','Synthetic test report near a demo asset.','Streetlights','p3','new',77.598,12.972),
   ('JS-0000000004','[DEMO] Drain overflow after rain','Synthetic drainage report for local workflow previews.','Drainage','p1','new',77.599,12.973),
   ('JS-0000000005','[DEMO] Water leak at junction','Synthetic water report for local workflow previews.','Water','p2','assigned',77.601,12.974),
   ('JS-0000000006','[DEMO] Missed waste collection','Synthetic sanitation report for local workflow previews.','Sanitation','p3','in_progress',77.597,12.975)
  ) as v(code,title,description,category,priority,status,lng,lat)
  join public.departments dept on dept.name='[DEMO] '||v.category cross join ward
  returning id,status
) insert into public.complaint_status_history(complaint_id,status,public_note)
select id,status,'Synthetic local demo status' from rows;
