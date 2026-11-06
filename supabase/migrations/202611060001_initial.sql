-- JanSetu first-release schema. Apply with `supabase db push` to a project with PostGIS enabled.
create extension if not exists pgcrypto;
create extension if not exists postgis with schema extensions;

create type public.user_role as enum ('super_admin','department_admin','ward_admin','field_worker','auditor');
create type public.complaint_status as enum ('new','assigned','accepted','in_progress','work_completed','awaiting_verification','verified','closed','reopened');
create type public.processing_status as enum ('queued','processing','completed','failed','manual_review','not_consented');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role public.user_role not null default 'auditor',
  department_id uuid,
  ward_id uuid,
  created_at timestamptz not null default now()
);
create table public.departments (id uuid primary key default gen_random_uuid(), name text not null unique, active boolean not null default true, created_at timestamptz not null default now());
create table public.wards (id uuid primary key default gen_random_uuid(), name text not null, ward_code text unique, municipality text not null default 'Unconfigured municipality', boundary extensions.geometry(MultiPolygon,4326), created_at timestamptz not null default now());
create table public.jurisdictions (id uuid primary key default gen_random_uuid(), ward_id uuid references public.wards(id), department_id uuid references public.departments(id), service_category text not null, boundary extensions.geometry(MultiPolygon,4326), source text, source_date date, coverage_percent numeric(5,2), active boolean not null default true, created_at timestamptz not null default now());
alter table public.profiles add constraint profiles_department_fk foreign key (department_id) references public.departments(id);
alter table public.profiles add constraint profiles_ward_fk foreign key (ward_id) references public.wards(id);

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  tracking_code_hash text not null unique check (length(tracking_code_hash)=64),
  title text not null check (length(title) between 4 and 120),
  description text not null check (length(description) between 8 and 2000),
  category text not null,
  subcategory text,
  address_text text not null,
  location extensions.geometry(Point,4326),
  ward_id uuid references public.wards(id),
  department_id uuid references public.departments(id),
  jurisdiction_rationale text,
  jurisdiction_evidence jsonb not null default '{}'::jsonb,
  jurisdiction_confidence numeric(4,3),
  status public.complaint_status not null default 'new',
  priority text not null default 'p3' check (priority in ('p0','p1','p2','p3')),
  priority_score numeric(6,2),
  priority_reasons jsonb not null default '[]'::jsonb,
  community_impact_score numeric(6,2),
  community_impact_inputs jsonb not null default '{}'::jsonb,
  ai_consent boolean not null default false,
  media_consent boolean not null default false,
  processing_status public.processing_status not null default 'manual_review',
  processing_error text,
  ai_category text,
  ai_translation text,
  ai_language text,
  ai_confidence numeric(4,3),
  repeat_cluster_id uuid,
  assigned_to uuid references public.profiles(id),
  source text not null default 'resident_web',
  spam_score numeric(4,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index complaints_location_gix on public.complaints using gist(location);
create index complaints_status_created_idx on public.complaints(status, created_at desc);
create index complaints_department_idx on public.complaints(department_id, status);
create index complaints_category_created_idx on public.complaints(category, created_at desc);
create index complaints_processing_idx on public.complaints(processing_status, created_at desc);

create table public.complaint_transcriptions (id uuid primary key default gen_random_uuid(), complaint_id uuid not null references public.complaints(id) on delete cascade, original_text text not null, original_language text, english_translation text, edited_by_resident boolean not null default false, created_at timestamptz not null default now());
create table public.complaint_media (id uuid primary key default gen_random_uuid(), complaint_id uuid not null references public.complaints(id) on delete cascade, original_name text not null, object_path text not null unique, public_redacted_path text, mime_type text not null, byte_size bigint not null check(byte_size between 0 and 10000000), consented_for_analysis boolean not null default false, processing_status text not null default 'stored', created_at timestamptz not null default now());
create table public.complaint_status_history (id uuid primary key default gen_random_uuid(), complaint_id uuid not null references public.complaints(id) on delete cascade, status public.complaint_status not null, public_note text, actor_id uuid references public.profiles(id), created_at timestamptz not null default now());
create table public.complaint_assignments (id uuid primary key default gen_random_uuid(), complaint_id uuid not null references public.complaints(id) on delete cascade, department_id uuid references public.departments(id), worker_id uuid references public.profiles(id), assigned_by uuid references public.profiles(id), rationale text, created_at timestamptz not null default now());
create table public.ai_processing_jobs (id uuid primary key default gen_random_uuid(), complaint_id uuid not null references public.complaints(id) on delete cascade, status text not null default 'queued' check(status in ('queued','processing','completed','retrying','failed')), attempts integer not null default 0, max_attempts integer not null default 5, next_attempt_at timestamptz not null default now(), task_types text[] not null default '{}', last_error text, locked_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index ai_jobs_ready_idx on public.ai_processing_jobs(next_attempt_at) where status in ('queued','retrying');
create or replace function public.enqueue_ai_processing_job() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.ai_consent then
    insert into public.ai_processing_jobs(complaint_id,status,task_types) values(new.id,'queued',array['language_detection','translation','classification']);
  end if;
  return new;
end $$;
create trigger complaint_enqueue_ai after insert on public.complaints for each row execute function public.enqueue_ai_processing_job();
create or replace function public.claim_ai_processing_jobs(batch_size integer default 3)
returns table(job_id uuid, complaint_id uuid, attempts integer, task_types text[])
language sql security definer set search_path=public as $$
  with ready as (select j.id from public.ai_processing_jobs j where j.status in ('queued','retrying') and j.next_attempt_at<=now() and j.attempts<j.max_attempts order by j.next_attempt_at for update skip locked limit greatest(1,least(batch_size,10))),
  claimed as (update public.ai_processing_jobs j set status='processing', attempts=j.attempts+1, locked_at=now(), updated_at=now() from ready where j.id=ready.id returning j.id,j.complaint_id,j.attempts,j.task_types)
  select claimed.id,claimed.complaint_id,claimed.attempts,claimed.task_types from claimed;
$$;
revoke all on function public.claim_ai_processing_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_ai_processing_jobs(integer) to service_role;
create table public.recurrence_flags (id uuid primary key default gen_random_uuid(), complaint_id uuid not null references public.complaints(id) on delete cascade, related_count integer not null default 0, radius_m integer not null, window_days integer not null, explanation text not null, reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, created_at timestamptz not null default now(), unique(complaint_id));
create table public.dataset_catalog (id uuid primary key default gen_random_uuid(), dataset_key text not null unique, title text not null, source text not null, source_date date, coverage geography(MultiPolygon,4326), coverage_percent numeric(5,2), last_checked_at timestamptz not null default now(), notes text, active boolean not null default true);
create table public.infrastructure_assets (id uuid primary key default gen_random_uuid(), asset_type text not null, label text not null, location extensions.geometry(Point,4326) not null, dataset_id uuid references public.dataset_catalog(id), attributes jsonb not null default '{}'::jsonb);
create index assets_location_gix on public.infrastructure_assets using gist(location);
create table public.sla_policies (id uuid primary key default gen_random_uuid(), category text not null, priority text not null, assignment_hours integer not null, response_hours integer not null, resolution_hours integer not null, active boolean not null default true, unique(category, priority));
create table public.escalation_events (id uuid primary key default gen_random_uuid(), complaint_id uuid not null references public.complaints(id) on delete cascade, event_type text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table public.resolution_evidence (id uuid primary key default gen_random_uuid(), complaint_id uuid not null references public.complaints(id) on delete cascade, worker_id uuid references public.profiles(id), object_path text not null, note text, submitted_at timestamptz not null default now());
create table public.resident_feedback (id uuid primary key default gen_random_uuid(), complaint_id uuid not null references public.complaints(id) on delete cascade, outcome text not null check(outcome in ('confirmed','disputed')), note text, created_at timestamptz not null default now());
create table public.audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id), action text not null, entity_type text not null, entity_id uuid, reason text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table public.system_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());

create or replace function public.current_user_role() returns public.user_role language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() $$;
create or replace function public.can_manage_complaints() returns boolean language sql stable security definer set search_path=public as $$ select coalesce(public.current_user_role() in ('super_admin','department_admin','ward_admin','field_worker','auditor'), false) $$;
create or replace function public.public_track_complaint(code_hash text) returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
declare result jsonb;
begin
  select jsonb_build_object('trackingCode', left(c.tracking_code_hash,0), 'title', c.title, 'category', c.category, 'status', c.status, 'priority', c.priority, 'department', d.name, 'ward', w.name, 'approximateArea', coalesce(w.name,'Municipality'), 'createdAt', c.created_at, 'updatedAt', c.updated_at, 'timeline', coalesce((select jsonb_agg(jsonb_build_object('status',h.status,'note',h.public_note,'at',h.created_at) order by h.created_at) from public.complaint_status_history h where h.complaint_id=c.id and h.public_note is not null),'[]'::jsonb))
  into result from public.complaints c left join public.departments d on d.id=c.department_id left join public.wards w on w.id=c.ward_id where c.tracking_code_hash=code_hash;
  return result;
end $$;
revoke all on function public.public_track_complaint(text) from public;
grant execute on function public.public_track_complaint(text) to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.wards enable row level security;
alter table public.jurisdictions enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_transcriptions enable row level security;
alter table public.complaint_media enable row level security;
alter table public.complaint_status_history enable row level security;
alter table public.complaint_assignments enable row level security;
alter table public.ai_processing_jobs enable row level security;
alter table public.recurrence_flags enable row level security;
alter table public.dataset_catalog enable row level security;
alter table public.infrastructure_assets enable row level security;
alter table public.sla_policies enable row level security;
alter table public.escalation_events enable row level security;
alter table public.resolution_evidence enable row level security;
alter table public.resident_feedback enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;

create policy "staff read own profile" on public.profiles for select to authenticated using (id=auth.uid() or public.current_user_role()='super_admin');
create policy "staff read department catalog" on public.departments for select to authenticated using (public.can_manage_complaints());
create policy "staff read wards" on public.wards for select to authenticated using (public.can_manage_complaints());
create policy "staff read jurisdictions" on public.jurisdictions for select to authenticated using (public.can_manage_complaints());
create policy "staff read complaints" on public.complaints for select to authenticated using (public.current_user_role()='super_admin' or (public.current_user_role()='department_admin' and department_id=(select department_id from public.profiles where id=auth.uid())) or (public.current_user_role()='ward_admin' and ward_id=(select ward_id from public.profiles where id=auth.uid())) or (public.current_user_role()='field_worker' and assigned_to=auth.uid()) or public.current_user_role()='auditor');
create policy "staff read transcription" on public.complaint_transcriptions for select to authenticated using (exists(select 1 from public.complaints c where c.id=complaint_id));
create policy "staff read private media" on public.complaint_media for select to authenticated using (exists(select 1 from public.complaints c where c.id=complaint_id));
create policy "staff read history" on public.complaint_status_history for select to authenticated using (exists(select 1 from public.complaints c where c.id=complaint_id));
create policy "staff update authorized complaints" on public.complaints for update to authenticated using (public.current_user_role() in ('super_admin','department_admin','ward_admin')) with check (public.current_user_role() in ('super_admin','department_admin','ward_admin'));
create policy "staff read assignments" on public.complaint_assignments for select to authenticated using (public.can_manage_complaints());
create policy "staff read jobs" on public.ai_processing_jobs for select to authenticated using (public.current_user_role() in ('super_admin','department_admin'));
create policy "staff update jobs" on public.ai_processing_jobs for update to authenticated using (public.current_user_role() in ('super_admin','department_admin')) with check (public.current_user_role() in ('super_admin','department_admin'));
create policy "staff read recurrence" on public.recurrence_flags for select to authenticated using (public.can_manage_complaints());
create policy "staff read datasets" on public.dataset_catalog for select to authenticated using (public.can_manage_complaints());
create policy "staff read assets" on public.infrastructure_assets for select to authenticated using (public.can_manage_complaints());
create policy "staff read sla" on public.sla_policies for select to authenticated using (public.can_manage_complaints());
create policy "staff read escalations" on public.escalation_events for select to authenticated using (public.can_manage_complaints());
create policy "staff read resolution evidence" on public.resolution_evidence for select to authenticated using (exists(select 1 from public.complaints c where c.id=complaint_id));
create policy "staff read feedback" on public.resident_feedback for select to authenticated using (public.current_user_role() in ('super_admin','department_admin','ward_admin','auditor'));
create policy "super admin read audit" on public.audit_logs for select to authenticated using (public.current_user_role()='super_admin' or public.current_user_role()='auditor');
create policy "super admin manage settings" on public.system_settings for all to authenticated using (public.current_user_role()='super_admin') with check (public.current_user_role()='super_admin');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('complaint-originals','complaint-originals',false,10000000,array['image/jpeg','image/png','image/webp','video/mp4','audio/webm','audio/mpeg','audio/mp4','audio/wav']),
('complaint-public','complaint-public',false,10000000,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

-- Retention and consent are configurable; production owners must choose locality/legal retention rules.
insert into public.system_settings(key,value) values
('privacy_policy', '{"retention_days":365,"delete_after_days":365,"public_media_requires_redaction":true,"ai_processing_consent_required":true}'::jsonb)
on conflict(key) do nothing;

create table public.api_rate_limits (key_hash text primary key check(length(key_hash)=64), window_started_at timestamptz not null, request_count integer not null default 0);
alter table public.api_rate_limits enable row level security;
create or replace function public.consume_api_rate_limit(p_key_hash text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  insert into public.api_rate_limits(key_hash,window_started_at,request_count) values(p_key_hash,now(),1)
  on conflict(key_hash) do update set
    request_count=case when public.api_rate_limits.window_started_at <= now()-make_interval(secs=>p_window_seconds) then 1 else public.api_rate_limits.request_count+1 end,
    window_started_at=case when public.api_rate_limits.window_started_at <= now()-make_interval(secs=>p_window_seconds) then now() else public.api_rate_limits.window_started_at end
  returning request_count into n;
  return n<=p_limit;
end $$;
revoke all on function public.consume_api_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_api_rate_limit(text,integer,integer) to service_role;
