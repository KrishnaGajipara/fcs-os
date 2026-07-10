# FCS OS — Fine Construction Specialties Operating System

Internal operations portal. Employees submit **Material Orders**, **Timesheets**,
and **QC Reports**; every submission is stored in the database and emailed to the
office automatically. The office manages everything from a password-protected
**Admin Dashboard**.

**Live (Vercel):** https://fcs-os.vercel.app/
**Live (GitHub Pages mirror):** https://krishnagajipara.github.io/fcs-os/
**Admin:** https://fcs-os.vercel.app/#/admin — default password same as computer password, changeable in-app

## Architecture

| Piece | Where | Notes |
| --- | --- | --- |
| Frontend | `web/` — React + Vite | Deployed to Vercel (Git integration) and GitHub Pages. Hash routing. |
| Database | Supabase project `aqtgokcftwsnyoqmoxnh` ("FCS OS") | Postgres + RLS |
| QC report data | `qc_reports.details` (JSONB) | Structured two-page Daily Quality Control Report |
| Email | Edge function `notify-submission` → Resend | Fired by DB triggers |
| Admin backend | Edge function `admin-api` | Password auth, HMAC session tokens, service-role reads |
| Order tracking | Edge function `order-status` | Public status read; warehouse updates via signed link |

### Submission flow

1. Employee submits a form using the **anon** key (RLS = insert-only; the public
   site can never read submissions back).
2. An `AFTER INSERT` trigger calls `notify-submission` via `pg_net`, which sends a
   branded email. Material-order emails include a secure "Update shipment status"
   link for the warehouse.
3. The employee sees a tracking link on the success screen and can download a
   branded Excel or CSV copy of the submission.

### Order status workflow

- Warehouse email → "Update shipment status" → tracking page (`#/track?ref=…&m=…`).
  The `m` token is `HMAC(ORDER_TOKEN_SECRET, reference)`; only the email holds it.
- Employees open `#/track?ref=…` (no token) to see read-only status + a timeline.
- The office changes status from the Admin dashboard (authenticated).
- Every change is logged to `material_order_events` for the timeline.

### Database tables (`public`)

- `materials` — 130-item parts catalog (Lead Job + Painting) from the scanned
  sheets. Edit in the Supabase dashboard; the site picks up changes automatically.
- `material_orders` — orders (`items` JSON: `{name, list, quantity, note}`),
  `status` ∈ pending/processing/shipped/cancelled.
- `material_order_events` — status history for the tracking timeline.
- `timesheets` — daily crew reports: `employees` JSON array
  (`{name, time_in, time_out, break_minutes, reg_hours, ot_hours, pt_hours, total}`)
  plus shift, job_floor, weather, and yes/no site conditions
  (work_stoppage, injuries, pre_task, inspections, slip_work).
- `qc_reports` — Daily Quality Control Reports. `details` stores all two-page
  report readings, checks, coating applications, comments, and signoffs.
- `admin_settings` — salted SHA-256 hash of the admin password (service-role only).

## Admin dashboard

`#/admin`, password-gated. Stat tiles (today / pending / this week / total), tabs
for each submission type, date-range + search filters, detail drawers, live status
management for orders, full Daily QC Report details, per-record and list-level Excel/CSV export,
and an in-app change-password screen.

## Common changes

**Notification recipient** (not hard-coded):
```sh
supabase secrets set --project-ref aqtgokcftwsnyoqmoxnh NOTIFY_EMAIL=warehouse@company.com
```
Comma-separate for multiple. Until a company domain is verified in Resend, the free
tier only delivers to the Resend account owner (krishnagajipara215@gmail.com) from
`onboarding@resend.dev`. After verifying a domain in Resend → Domains:
```sh
supabase secrets set --project-ref aqtgokcftwsnyoqmoxnh FROM_EMAIL="FCS OS <os@yourdomain.com>"
```

**Tracking-link base URL** (used in warehouse emails):
```sh
supabase secrets set --project-ref aqtgokcftwsnyoqmoxnh SITE_URL=https://fcs-os.vercel.app/
```

**Admin password** — change it in-app (Admin → Change password), or reset the
`admin_settings` row.

**Email provider** — `supabase/functions/notify-submission/index.ts` has a
`PROVIDERS` map; add a sender, then set `EMAIL_PROVIDER` and redeploy.

## Deploying

- **Vercel** auto-deploys on push to `main` (config in `vercel.json`; builds
  `web/` and serves `web/dist`). Public Supabase vars live in `web/.env.production`.
- **GitHub Pages** mirror: `cd web && npm run build`, then push `web/dist` to the
  `gh-pages` branch.

## Local development

```sh
cd web && npm install && npm run dev   # needs web/.env with VITE_SUPABASE_* vars
```

## Repo layout

```
db/        SQL migrations (001–008) + catalog.py (parts catalog source of truth)
supabase/  edge functions: notify-submission, admin-api, order-status
scripts/   sbq.py — run SQL via the Supabase Management API
web/        frontend
```

`web/.env.production` holds only the **public** anon key (safe to commit — it ships
in the browser bundle and is protected by RLS). Real secrets (service role, Resend
key, admin/HMAC secrets) live only in `.env` at the repo root (gitignored) and in
Supabase function secrets.
