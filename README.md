# FCS OS — Fine Construction Specialties Operating System

Internal operations portal. Phase 1: **Material Order**, **Timesheet**, and
**QC Report** forms. Each submission is stored in the database and emailed to
the office automatically.

**Live site:** https://krishnagajipara.github.io/fcs-os/

## Architecture

| Piece | Where | Notes |
| --- | --- | --- |
| Frontend | `web/` — React + Vite, deployed to GitHub Pages | Static SPA, hash routing |
| Database | Supabase project `aqtgokcftwsnyoqmoxnh` ("FCS OS") | Postgres + RLS |
| Storage | Supabase bucket `qc-photos` (private) | QC photo uploads |
| Email | Supabase Edge Function `notify-submission` → Resend | Fired by DB triggers |

### Data flow

1. Employee submits a form (anon key, **insert-only** row level security —
   the public site can never read submissions back).
2. An `AFTER INSERT` trigger (`db/003_webhooks.sql`) calls the
   `notify-submission` edge function through `pg_net`.
3. The function renders a branded HTML email and sends it via the configured
   provider. QC photo links are 30-day signed URLs into the private bucket.

### Database tables

- `materials` — the full parts catalog (130 items) transcribed from the paper
  Lead Job / Painting order sheets. Edit in the Supabase dashboard to
  add/retire items; the site picks changes up automatically.
- `material_orders` — submitted orders (`items` is a JSON array of
  `{name, list, quantity, note}`).
- `timesheets` — daily hours per employee/job.
- `qc_reports` — inspections incl. result and photo paths.

## Changing the notification recipient

The recipient is **not** hard-coded. From `fcs-os/`:

```sh
supabase secrets set --project-ref aqtgokcftwsnyoqmoxnh NOTIFY_EMAIL=warehouse@company.com
```

Comma-separate for multiple recipients. Until a company domain is verified in
Resend, the free tier only delivers to the Resend account owner's inbox
(krishnagajipara215@gmail.com) from `onboarding@resend.dev`. After verifying a
domain in Resend → Domains, also set:

```sh
supabase secrets set --project-ref aqtgokcftwsnyoqmoxnh FROM_EMAIL="FCS OS <os@yourdomain.com>"
```

## Changing the email provider later

`supabase/functions/notify-submission/index.ts` has a `PROVIDERS` map.
Add a sender function for the new provider, then:

```sh
supabase secrets set --project-ref aqtgokcftwsnyoqmoxnh EMAIL_PROVIDER=<name> <NAME>_API_KEY=...
supabase functions deploy notify-submission --project-ref aqtgokcftwsnyoqmoxnh --no-verify-jwt --use-api
```

## Local development

```sh
cd web
npm install
npm run dev        # needs web/.env with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
```

## Deploying the site

```sh
cd web && npm run build
cd dist && git init -b gh-pages && git add -A && git commit -m deploy
git push -f https://github.com/KrishnaGajipara/fcs-os.git gh-pages
```

## Repo layout

```
db/        SQL migrations + canonical materials catalog (catalog.py)
supabase/  edge function source
scripts/   sbq.py — run SQL via the Supabase Management API
web/       frontend
```

Secrets (`.env` at the repo root) are intentionally not committed.
