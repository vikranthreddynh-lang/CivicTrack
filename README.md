# JanSetu

JanSetu is a responsive municipal complaint workflow. Residents submit and track reports without accounts; municipal staff review, prioritize, and assign them; field workers submit evidence; residents confirm or dispute resolutions.

## Run locally

Use Node.js 22.13 or later. Copy `.env.example` to `.env.local`, configure a Supabase project, then run:

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without Supabase, the resident reporting page still runs in demo mode; reports are stored only in that browser and are not sent to municipal staff. Sample complaints are marked `[DEMO]` and must never be presented as real city records.

## Supabase

1. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` name is also accepted.
2. Set `SUPABASE_SECRET_KEY` only as a server-side secret. The legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted. Never put either key in a `NEXT_PUBLIC_` variable or commit it.
3. Apply all SQL files in `supabase/migrations` in filename order using the Supabase SQL Editor or `supabase db push`. This enables PostGIS, complaint tables and indexes, role checks, RLS, private media, jurisdiction resolution, community-impact inputs, recurrence detection, and staff map access.
4. Provision a trusted administrator using the documented one-time SQL/profile procedure in Supabase, or `npm run admin:provision` after setting `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SECRET_KEY` in the current PowerShell process. Do not enable public staff registration.
5. Configure ward boundaries, department service rules, dataset source/date/coverage, SLA policies, retention policy, SMTP, and Auth redirect URLs for the target municipality before production use.

The admin dashboard and staff heat map require an authenticated staff role. Exact coordinates and original media are restricted to authorized staff. Public tracking omits exact coordinates, internal notes, and media. Complaint tracking codes are random, returned once, and stored as hashes.

## AI and scheduled tasks

Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL`. Gemini runs server-side and its output is advisory. Residents can decline AI processing; those reports are retained for manual review. Media is not sent for image analysis or shown publicly until redaction is supported. Failed jobs use durable queue rows, retry backoff, visible processing status, and a staff retry action.

Configure a trusted scheduler to call the following authenticated endpoints with `Authorization: Bearer $CRON_SECRET`:

| Endpoint | Cadence | Purpose |
| --- | --- | --- |
| `/api/ai/process` | Every minute | Process queued AI jobs and retry transient failures |
| `/api/sla/run` | Every 15 minutes | Record SLA escalation events |
| `/api/privacy/retention` | Daily | Enforce configured retention and remove eligible files |

Set a strong `CRON_SECRET` and `RATE_LIMIT_SALT`. Provider quotas and free-tier data terms change; review Google's current Gemini terms before enabling AI in production.

## Routes

- `/` — resident intake, device-local history, report confirmation and QR/share flow
- `/track` — public-safe status tracking, resident confirmation/dispute, deletion request
- `/admin/login` — provisioned staff sign-in
- `/admin` — role-scoped complaint operations, AI queue and manual retries
- `/admin/map` — staff-only interactive density heat map and report-pin view, filters, search and live refresh
- `/worker` — field assignments, status changes and private evidence uploads

The map uses OpenStreetMap tiles and displays only staff-authorized complaint coordinates. Heat values indicate relative report density in nearby locations; they are not a measure of citywide service quality. Dataset source, date, and coverage are recorded with impact inputs so partial municipal data is not described as comprehensive. Predictive infrastructure-failure graphs and the what-if simulator remain Phase 2.

## Verification

```powershell
npx tsc --noEmit
npm run lint
npm test
npm run build
```

To deploy, connect this repository to Vercel, configure environment variables for each environment, apply migrations, provision the initial administrator, and configure the scheduled endpoints. No public website is live until a hosting account completes a deployment.
