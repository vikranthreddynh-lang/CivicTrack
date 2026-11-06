-- Run once in Supabase SQL Editor after the first staff member has signed up.
-- Replace the email below. This script must only be run by a trusted project owner.
insert into public.user_roles (user_id, role)
select id, 'admin'
from auth.users
where lower(email) = lower('replace-with-admin@example.com')
on conflict (user_id) do update set role = 'admin';

-- Verify the role was assigned, then remove this bootstrap instruction from your runbook.
select u.email, r.role
from public.user_roles r join auth.users u on u.id = r.user_id
where lower(u.email) = lower('replace-with-admin@example.com');
