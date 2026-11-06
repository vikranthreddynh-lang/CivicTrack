create or replace function public.enqueue_ai_processing_job() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.ai_consent then insert into public.ai_processing_jobs(complaint_id,status,task_types) values(new.id,'queued',array['language_detection','translation','classification']); end if;
  return new;
end $$;
drop trigger if exists complaint_enqueue_ai on public.complaints;
create trigger complaint_enqueue_ai after insert on public.complaints for each row execute function public.enqueue_ai_processing_job();

create or replace function public.resolve_jurisdiction(p_lat double precision,p_lng double precision,p_category text)
returns table(ward_id uuid,department_id uuid,rationale text,evidence jsonb)
language sql stable security definer set search_path=public,extensions as $$
  select w.id,d.id,format('Point falls within configured %s service boundary for %s.',w.name,d.name),
    jsonb_build_object('ward',w.name,'department',d.name,'rule_category',j.service_category,'source',j.source,'source_date',j.source_date,'coverage_percent',j.coverage_percent)
  from public.jurisdictions j join public.wards w on w.id=j.ward_id join public.departments d on d.id=j.department_id
  where j.active and j.service_category ilike p_category and coalesce(j.boundary,w.boundary) is not null
    and extensions.ST_Contains(coalesce(j.boundary,w.boundary),extensions.ST_SetSRID(extensions.ST_Point(p_lng,p_lat),4326))
  order by case when j.service_category ilike p_category then 0 else 1 end limit 1;
$$;
revoke all on function public.resolve_jurisdiction(double precision,double precision,text) from public,anon,authenticated;
grant execute on function public.resolve_jurisdiction(double precision,double precision,text) to service_role;

create or replace function public.calculate_community_impact(p_lat double precision,p_lng double precision)
returns jsonb language sql stable security definer set search_path=public,extensions as $$
  with nearby as (
    select a.asset_type,a.dataset_id,a.attributes,d.title dataset_title,d.source,d.source_date,d.coverage_percent
    from public.infrastructure_assets a left join public.dataset_catalog d on d.id=a.dataset_id
    where extensions.ST_DWithin(a.location::extensions.geography,extensions.ST_SetSRID(extensions.ST_Point(p_lng,p_lat),4326)::extensions.geography,1000)
  ), counts as (
    select count(*) filter(where lower(asset_type) in ('hospital','emergency')) hospitals,
      count(*) filter(where lower(asset_type)='school') schools,
      count(*) filter(where lower(asset_type) in ('road','arterial_road')) roads,
      coalesce(sum(nullif(attributes->>'estimated_population','')::numeric) filter(where lower(asset_type)='population_estimate'),0) population,
      coalesce(jsonb_agg(distinct jsonb_build_object('dataset',dataset_title,'source',source,'source_date',source_date,'coverage_percent',coverage_percent)) filter(where dataset_id is not null),'[]'::jsonb) sources
    from nearby
  )
  select jsonb_build_object('score',least(100,hospitals*18+schools*12+roads*6+least(population/100,20)),
    'inputs',jsonb_build_object('hospitals_within_1km',hospitals,'schools_within_1km',schools,'essential_roads_within_1km',roads,'estimated_population',population,'datasets',sources),
    'coverage',case when jsonb_array_length(sources)=0 then 'unavailable' else 'partial; review dataset coverage before interpreting' end)
  from counts;
$$;
revoke all on function public.calculate_community_impact(double precision,double precision) from public,anon,authenticated;
grant execute on function public.calculate_community_impact(double precision,double precision) to service_role;

create or replace function public.find_recurring_complaints(p_complaint_id uuid,p_radius_m integer default 300,p_window_days integer default 90)
returns jsonb language sql stable security definer set search_path=public,extensions as $$
  with current as (select id,category,location from public.complaints where id=p_complaint_id), matches as (
    select c.id from public.complaints c,current x where c.id<>x.id and c.category=x.category and c.created_at>=now()-make_interval(days=>p_window_days)
      and c.location is not null and x.location is not null and extensions.ST_DWithin(c.location::extensions.geography,x.location::extensions.geography,p_radius_m)
  ) select jsonb_build_object('related_count',count(*),'related_ids',coalesce(jsonb_agg(id),'[]'::jsonb),'radius_m',p_radius_m,'window_days',p_window_days) from matches;
$$;
revoke all on function public.find_recurring_complaints(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.find_recurring_complaints(uuid,integer,integer) to service_role;

create or replace function public.public_track_complaint(code_hash text) returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
declare result jsonb;
begin
  select jsonb_build_object('title',c.title,'category',c.category,'status',c.status,'priority',c.priority,'department',d.name,'ward',w.name,'approximateArea',coalesce(w.name,'Municipality'),'createdAt',c.created_at,'updatedAt',c.updated_at,
    'timeline',coalesce((select jsonb_agg(jsonb_build_object('status',h.status,'note',h.public_note,'at',h.created_at) order by h.created_at) from public.complaint_status_history h where h.complaint_id=c.id and h.public_note is not null),'[]'::jsonb))
  into result from public.complaints c left join public.departments d on d.id=c.department_id left join public.wards w on w.id=c.ward_id where c.tracking_code_hash=code_hash;
  return result;
end $$;

drop policy if exists "admins append audit events" on public.audit_logs;
create policy "admins append audit events" on public.audit_logs for insert to authenticated with check (actor_id=auth.uid() and public.current_user_role() in ('super_admin','department_admin','ward_admin'));

drop policy if exists "admins append escalation events" on public.escalation_events;
create policy "admins append escalation events" on public.escalation_events for insert to authenticated with check (public.current_user_role() in ('super_admin','department_admin','ward_admin') and exists(select 1 from public.complaints c where c.id=complaint_id));

create or replace function public.current_user_department_id() returns uuid language sql stable security definer set search_path=public as $$ select department_id from public.profiles where id=auth.uid() $$;

drop policy if exists "admins list scoped workers" on public.profiles;
create policy "admins list scoped workers" on public.profiles for select to authenticated using (public.current_user_role()='super_admin' or (public.current_user_role()='department_admin' and department_id=public.current_user_department_id() and role='field_worker'));

drop policy if exists "staff upload assigned resolution photos" on storage.objects;
create policy "staff upload assigned resolution photos" on storage.objects for insert to authenticated with check (
  bucket_id='complaint-originals' and exists(select 1 from public.complaints c where c.id::text=(storage.foldername(name))[1] and (public.current_user_role() in ('super_admin','department_admin') or (public.current_user_role()='field_worker' and c.assigned_to=auth.uid())))
);

drop policy if exists "staff append public status history" on public.complaint_status_history;
create policy "staff append public status history" on public.complaint_status_history for insert to authenticated with check (actor_id=auth.uid() and public.can_manage_complaints());

drop policy if exists "assigned worker update own complaint" on public.complaints;
create policy "assigned worker update own complaint" on public.complaints for update to authenticated using (public.current_user_role()='field_worker' and assigned_to=auth.uid()) with check (public.current_user_role()='field_worker' and assigned_to=auth.uid());

drop policy if exists "staff update authorized complaints" on public.complaints;
create policy "staff update authorized complaints" on public.complaints for update to authenticated
using (public.current_user_role()='super_admin' or (public.current_user_role()='department_admin' and department_id=(select department_id from public.profiles where id=auth.uid())) or (public.current_user_role()='ward_admin' and ward_id=(select ward_id from public.profiles where id=auth.uid())))
with check (public.current_user_role()='super_admin' or (public.current_user_role()='department_admin' and department_id=(select department_id from public.profiles where id=auth.uid())) or (public.current_user_role()='ward_admin' and ward_id=(select ward_id from public.profiles where id=auth.uid())));

create table if not exists public.complaint_internal_notes(id uuid primary key default gen_random_uuid(),complaint_id uuid not null references public.complaints(id) on delete cascade,author_id uuid not null references public.profiles(id),note text not null check(length(note)<=2000),created_at timestamptz not null default now());
alter table public.complaint_internal_notes enable row level security;

drop policy if exists "staff read authorized internal notes" on public.complaint_internal_notes;
create policy "staff read authorized internal notes" on public.complaint_internal_notes for select to authenticated using (exists(select 1 from public.complaints c where c.id=complaint_id));

drop policy if exists "authorized staff add internal notes" on public.complaint_internal_notes;
create policy "authorized staff add internal notes" on public.complaint_internal_notes for insert to authenticated with check (author_id=auth.uid() and public.current_user_role() in ('super_admin','department_admin','ward_admin','field_worker') and exists(select 1 from public.complaints c where c.id=complaint_id));

drop policy if exists "admins assign complaints" on public.complaint_assignments;
create policy "admins assign complaints" on public.complaint_assignments for insert to authenticated with check (assigned_by=auth.uid() and public.current_user_role() in ('super_admin','department_admin','ward_admin') and exists(select 1 from public.complaints c where c.id=complaint_id));

drop policy if exists "workers add resolution evidence" on public.resolution_evidence;
create policy "workers add resolution evidence" on public.resolution_evidence for insert to authenticated with check (worker_id=auth.uid() and public.current_user_role() in ('super_admin','department_admin','field_worker') and exists(select 1 from public.complaints c where c.id=complaint_id));

drop policy if exists "staff read resolution media objects" on storage.objects;
create policy "staff read resolution media objects" on storage.objects for select to authenticated using (
  bucket_id='complaint-originals' and exists (
    select 1 from public.resolution_evidence e join public.complaints c on c.id=e.complaint_id
    where e.object_path=name and c.id::text=(storage.foldername(name))[1]
  )
);

alter table public.complaints add column if not exists first_response_at timestamptz;
alter table public.complaints add column if not exists sla_response_due_at timestamptz;
alter table public.complaints add column if not exists sla_resolution_due_at timestamptz;
alter table public.complaints add column if not exists sla_assignment_due_at timestamptz;
alter table public.complaints add column if not exists escalation_level integer not null default 0;
