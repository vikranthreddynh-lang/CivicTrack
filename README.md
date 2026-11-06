# JANSETU — Civic issue reporting

A local civic issue reporting prototype with resident voice intake, department suggestions, location pins, Civic Signals, a staff case queue, resident tracking, and FixProof resolution receipts. Complaint data is stored in a local SQLite database for this demo.

## Run locally

Requires Node.js 22.13+ (`node:sqlite` is used; Node 24 is recommended).

```bash
npm install
npm run dev
```

On PowerShell, run `Copy-Item .env.example .env.local` first if you want to configure optional services. On macOS or Linux, use `cp .env.example .env.local`.

Open [http://localhost:3000](http://localhost:3000). The SQLite database is created at `data/poya.sqlite` and seeded with demo reports on first run. Remove that file to reset the local demo.

## Demo workflows

- **Resident:** choose **New report**, record a voice note, review or edit the transcript, optionally request and review a Gemini suggestion, set the issue location, and submit. A tracking code opens after successful save.
- **Staff:** open a report from **Latest reports**, change its status, add a crew update, and attach FixProof evidence.
- **Civic Signal:** create another same-category report within 600 m of an existing issue. Nearby reports group into a shared signal.
- **Resident confirmation:** use **Track a report** or a report detail to confirm a resolved fix or reopen it as still broken.

## Optional integrations

Copy `.env.example` to `.env.local`, fill in the keys you want, and restart the dev server. Leaving either key blank does not disable the app.

### Google Maps JavaScript API

- Enable the **Maps JavaScript API** in a Google Cloud project and configure billing.
- Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. This is a browser key by design; restrict it to the app's HTTP referrers and only the APIs needed.
- Optionally set `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` for a Cloud-styled map. The app also works without a map ID.
- JANSETU uses interactive maps with issue markers and draggable/clickable report pins when available. Without a key, or if the API fails to load or authorize, it shows an OpenStreetMap preview and keeps address search, current location, and Google Maps links available.
- Google Maps usage may be billed according to the selected project and current Maps Platform pricing. See [Maps JavaScript API setup](https://developers.google.com/maps/documentation/javascript/get-api-key).

### Gemini complaint suggestions

- Create an API key in Google AI Studio and set `GEMINI_API_KEY` on the server. Keep this variable private; do not prefix it with `NEXT_PUBLIC_` or commit it.
- `GEMINI_MODEL` is optional and defaults to `gemini-3.8-flash`; change it to a model enabled for your API project if needed.
- Gemini proposes a title, summary, category, department, and priority. Residents review and apply suggestions; the supported category-to-department mapping is checked before returning. AI does not decide jurisdiction. The report description is sent to Google only when the resident requests an AI suggestion.
- Without a key, on provider error, or when output validation fails, the existing local keyword classifier and editable form remain available. Reports can still be submitted.
- The endpoint limits input size and applies a lightweight per-process request limit. Production deployments should add durable rate limiting and user authentication before exposing a paid AI key publicly.
- Review [Gemini API pricing and data-use terms](https://ai.google.dev/gemini-api/docs/pricing) for the tier you choose.

### Voice and location fallbacks

- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` enable Cloudflare Workers AI Whisper transcription. Without them, browser speech recognition works where available and the transcript remains editable.
- Address pin search uses OpenStreetMap Nominatim. It is independent of the Google Maps key; current location uses browser geolocation. If no address can be geocoded, the resident can use current location or select a point on Google Maps when configured.

## Local demo limitations

This is a hackathon prototype, not a deployed municipal service. Complaint storage uses local SQLite and is not shared across deployments. Authentication and production security controls are not included in this demo build.
