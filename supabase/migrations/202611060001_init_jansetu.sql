create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'resident' check (role in ('resident', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role)
  values (new.id, 'resident')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_jansetu on auth.users;
create trigger on_auth_user_created_jansetu
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  tracking_code text not null unique,
  resident_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 8 and 5000),
  category text not null check (category in ('Roads', 'Waste', 'Water', 'Streetlights')),
  department text not null,
  status text not null default 'Received' check (status in ('Received', 'Assigned', 'In progress', 'Resolved')),
  priority text not null default 'Normal' check (priority in ('Critical', 'High', 'Normal', 'Low')),
  location text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  reporter text not null default 'Resident',
  updates jsonb not null default '[]'::jsonb,
  photo_paths text[] not null default '{}',
  evidence text,
  evidence_path text,
  resident_feedback text check (resident_feedback in ('fixed', 'still_broken')),
  signal_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists complaints_resident_created_idx on public.complaints (resident_id, created_at desc);
create index if not exists complaints_priority_created_idx on public.complaints (priority, created_at desc);
create index if not exists complaints_location_idx on public.complaints (lat, lng);

create or replace function public.prepare_new_complaint()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare
  nearby_count integer;
  photo_path text;
begin
  new.status := 'Received';
  new.updated_at := now();
  new.department := case new.category
    when 'Roads' then 'Roads & Mobility'
    when 'Waste' then 'Sanitation'
    when 'Water' then 'Water Works'
    when 'Streetlights' then 'Electrical Services'
  end;

  if not (select public.is_admin()) then
    foreach photo_path in array new.photo_paths loop
      if split_part(photo_path, '/', 1) <> (select auth.uid())::text then
        raise exception 'Complaint photo path is not owned by the signed-in resident';
      end if;
    end loop;
  end if;

  select count(*) into nearby_count
  from public.complaints c
  where c.category = new.category and c.status <> 'Resolved'
    and abs(c.lat - new.lat) <= 600.0 / 111000.0
    and abs(c.lng - new.lng) <= 600.0 / (111000.0 * greatest(abs(cos(radians(new.lat))), 0.25))
    and 6371000.0 * 2 * asin(sqrt(
      sin(radians(c.lat - new.lat) / 2)^2 +
      cos(radians(new.lat)) * cos(radians(c.lat)) * sin(radians(c.lng - new.lng) / 2)^2
    )) <= 600.0;

  if new.description ~* '(fallen (power )?line|live wire|electrocution|building collapse|person (is )?injured|fire|gas leak|open manhole|road cave.?in|flood(ed|ing) (home|house|school))' then
    new.priority := 'Critical';
  elsif new.description ~* '(urgent|danger(ous)?|sparks|injur|overflow|burst pipe|sewage|heavy flood|traffic hazard|blocked drain)' or nearby_count >= 2 then
    new.priority := 'High';
  else
    new.priority := 'Normal';
  end if;
  return new;
end;
$$;

drop trigger if exists prepare_new_complaint_trigger on public.complaints;
create trigger prepare_new_complaint_trigger
  before insert on public.complaints
  for each row execute procedure public.prepare_new_complaint();

create table if not exists public.complaint_updates (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('resident', 'admin', 'system')),
  update_type text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists complaint_updates_complaint_created_idx on public.complaint_updates (complaint_id, created_at);

create table if not exists public.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invited_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index if not exists one_pending_admin_invite_per_email on public.admin_invitations (lower(email)) where status = 'pending';

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_updates enable row level security;
alter table public.admin_invitations enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.profiles, public.user_roles, public.complaints, public.complaint_updates, public.admin_invitations, public.audit_logs from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, insert on public.complaints to authenticated;
grant update on public.complaints to authenticated;
grant select, insert on public.complaint_updates to authenticated;
grant select, insert, update on public.admin_invitations to authenticated;
grant select, insert on public.audit_logs to authenticated;

create policy "users read own profile and admins read profiles" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "users read own role and admins read roles" on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "residents read own complaints and admins read all" on public.complaints
  for select to authenticated using (resident_id = (select auth.uid()) or (select public.is_admin()));
create policy "residents create their own complaints" on public.complaints
  for insert to authenticated with check (resident_id = (select auth.uid()) and status = 'Received');
create policy "admins update complaints" on public.complaints
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "complaint owner or admin reads updates" on public.complaint_updates
  for select to authenticated using (
    (select public.is_admin()) or exists (
      select 1 from public.complaints c where c.id = complaint_id and c.resident_id = (select auth.uid())
    )
  );
create policy "admins add updates" on public.complaint_updates
  for insert to authenticated with check ((select public.is_admin()) and actor_id = (select auth.uid()));
create policy "admins manage invitations" on public.admin_invitations
  for select to authenticated using ((select public.is_admin()));
create policy "admins create invitations" on public.admin_invitations
  for insert to authenticated with check ((select public.is_admin()) and invited_by = (select auth.uid()));
create policy "admins update invitations" on public.admin_invitations
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins read audit logs" on public.audit_logs
  for select to authenticated using ((select public.is_admin()));
create policy "admins write audit logs" on public.audit_logs
  for insert to authenticated with check ((select public.is_admin()) and actor_id = (select auth.uid()));

create or replace function public.submit_resolution_feedback(p_tracking_code text, p_feedback text)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare target public.complaints%rowtype;
begin
  if p_feedback not in ('fixed', 'still_broken') then raise exception 'Invalid feedback'; end if;
  select * into target from public.complaints
  where tracking_code = p_tracking_code and resident_id = (select auth.uid()) and status = 'Resolved'
  for update;
  if not found then raise exception 'Complaint not found or not awaiting resident feedback'; end if;
  update public.complaints set
    resident_feedback = p_feedback,
    status = case when p_feedback = 'still_broken' then 'In progress' else status end,
    updated_at = now(),
    updates = updates || jsonb_build_array(jsonb_build_object(
      'at', now(),
      'text', case when p_feedback = 'fixed' then 'Resident confirmed the fix worked.' else 'Resident reported the issue remains; case reopened.' end,
      'by', 'Resident'
    ))
  where id = target.id;
  insert into public.complaint_updates (complaint_id, actor_id, actor_role, update_type, body)
  values (target.id, (select auth.uid()), 'resident', 'resolution_feedback', p_feedback);
end;
$$;
revoke all on function public.submit_resolution_feedback(text, text) from public, anon;
grant execute on function public.submit_resolution_feedback(text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-photos', 'complaint-photos', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

create policy "residents upload complaint photos in own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'complaint-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "complaint owners and admins read photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'complaint-photos' and (
      (storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())
    )
  );
create policy "complaint owners and admins delete photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'complaint-photos' and (
      (storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())
    )
  );
