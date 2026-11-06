create or replace function public.staff_map_data()
returns table(complaint_id uuid,title text,category text,status text,priority text,latitude double precision,longitude double precision,created_at timestamptz,ward text)
language sql stable security invoker set search_path=public,extensions as $$
  select c.id,c.title,c.category,c.status::text,c.priority,extensions.ST_Y(c.location)::double precision,extensions.ST_X(c.location)::double precision,c.created_at,w.name
  from public.complaints c left join public.wards w on w.id=c.ward_id where c.location is not null order by c.created_at desc limit 1000;
$$;
grant execute on function public.staff_map_data() to authenticated;

do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='complaints') then
    alter publication supabase_realtime add table public.complaints;
  end if;
end $$;

drop policy if exists "staff read private complaint media objects" on storage.objects;
create policy "staff read private complaint media objects" on storage.objects for select to authenticated using (
  bucket_id='complaint-originals' and exists (
    select 1 from public.complaint_media m join public.complaints c on c.id=m.complaint_id
    where m.object_path=name and c.id::text=(storage.foldername(name))[1]
  )
);
