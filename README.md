# JANSETU

**See it. Speak it. Signal it. Fix it. Prove it.**

JANSETU connects resident reports to a shared municipal queue with role-separated resident and administrator workspaces, automatic department and priority suggestions, private report photos, map context, resolution updates, and resident FixProof feedback.

## Login and roles

- **Resident login:** `/login`
- **Resident signup:** `/signup` — public signup can only create a resident account.
- **Resident dashboard:** `/resident` — the signed-in resident sees only their own complaints, updates, and photos.
- **Admin login:** `/admin/login`
- **Admin command center:** `/admin` — server-side role checks and database RLS protect the global complaint queue.
- **Password recovery:** `/forgot-password`
- **Local resident demo:** `/demo/resident` in development only. Submit reports and see them enter the shared local queue.
- **Local admin demo:** `/demo` in development only. Review resident demo submissions, set status and priority, and add resolution proof. Both demo workspaces use the same local SQLite database; neither demo route is enabled in production.

Without Supabase configuration, the sign-in pages remain available and explain what is missing; they do not fake a successful login. Production complaint APIs return a configuration error instead of silently writing to a machine-local database.

## Local development

Requires Node.js 22.13+ (`node:sqlite` is used for the local demo; Node 24 is recommended).

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With no Supabase keys, use **Open local demo dashboard** on the home page. The local demo creates `data/poya.sqlite` with sample records. The file is gitignored and remains local.

## Supabase production setup

1. Create a Supabase project and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in local `.env.local` and your Vercel project. The legacy anon key variable is also supported.
2. Apply [`supabase/migrations/202611060001_init_jansetu.sql`](supabase/migrations/202611060001_init_jansetu.sql) in the Supabase SQL Editor. It creates resident profiles and roles, complaints, audit/update tables, RLS policies, the private photo bucket, and the resident resolution-feedback function.
3. In Supabase Auth URL configuration, set the production Site URL and add both local and production `/auth/callback` URLs to the redirect allowlist.
4. Configure custom SMTP in Supabase Auth so confirmation, reset, and admin invitation emails can be delivered.
5. Create the first trusted staff account through `/signup`, then run [`supabase/bootstrap-first-admin.sql`](supabase/bootstrap-first-admin.sql) in the SQL Editor after replacing its placeholder email. This trusted one-time script is the only bootstrap path; public signup always creates resident access.
6. Set `SUPABASE_SERVICE_ROLE_KEY` only as a server-side environment secret if admins need to invite or revoke other administrators. Never add it to a `NEXT_PUBLIC_` variable or commit it.

Supabase RLS lets residents read and create only their own complaints; admins can access the global queue. Admin invitation acceptance checks the signed-in email against an unexpired pending invitation before assigning the admin role. Complaint photos are stored in a private bucket and returned to authorized viewers as expiring signed URLs.

## Optional services

- **Google Maps:** Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and optionally `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. Enable Maps JavaScript API and billing in Google Cloud, then restrict the browser key by allowed referrers and API. When the key is absent or the map fails, JANSETU shows an OpenStreetMap preview; address search and current location are independent of Google Maps. Google Maps usage may be billed. See [Google Maps setup](https://developers.google.com/maps/documentation/javascript/get-api-key).
- **Gemini:** Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` (`gemini-3.8-flash` by default). The key is server-only. Residents can request, review, and apply title/category suggestions. The deterministic server priority rules and admin review remain active if Gemini is unavailable. Review [Gemini pricing and data-use terms](https://ai.google.dev/gemini-api/docs/pricing).
- **Voice transcription:** `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` enable Cloudflare Whisper. Browser speech recognition and editable text remain as fallbacks.
- **Address search:** Uses OpenStreetMap Nominatim and does not need the Google Maps key.

## Priority handling

New complaints receive a server-side priority recommendation. Explicit immediate safety hazards can become **Critical**; other hazard terms become **High**. Nearby unresolved reports of the same category can raise a normal issue to **High**, but duplicate count alone cannot make an issue Critical. The admin queue defaults to Critical → High → Normal → Low, with status/priority filters and newest/oldest sort options. An admin can override priority only with a recorded reason.

## Deploy to Vercel

1. Import `vikranthreddynh-lang/CivicTrack` into Vercel.
2. Select Node.js 22 and configure Supabase environment variables for Production, Preview, and Development as appropriate. Add `SUPABASE_SERVICE_ROLE_KEY` only as a server secret. Add optional map, Gemini, and Cloudflare variables only if those features are enabled.
3. Apply the Supabase migration, configure Auth URLs and SMTP, and bootstrap the first admin before inviting staff.
4. Deploy and verify resident signup/login, admin login, RLS ownership, report/photo persistence, priority queue ordering, and password-reset/invitation emails against the connected project.

The repo is deployment-ready, but no public website URL exists until a Vercel project is connected and a deployment completes successfully. Do not put service-role keys or API secrets in GitHub.

## Current boundaries

The production backend is Supabase when configured. SQLite remains only for the explicit local demo. Jurisdiction boundaries, municipal authority contacts, and service deadlines are not fabricated or configured by this starter; deployments must add verified city data and policies before presenting them as official routing or SLA results.
