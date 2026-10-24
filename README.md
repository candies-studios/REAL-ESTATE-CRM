# Navi Estates — real estate brokerage platform

Lead generation, buyer qualification, CRM pipeline, inventory, site visits and automated broker
follow-ups for a property brokerage in Navi Mumbai. **Next.js 15 + TypeScript + Tailwind CSS v4**
on **Supabase** (Postgres, Auth, Storage, Row Level Security). Deploys to **Vercel**.

> "Navi Estates" is a working name: set `NEXT_PUBLIC_BRAND_NAME`. Colours are in
> `src/app/globals.css`, the logo in `src/components/ui/card.tsx`.

---

## What's included

**Public website**
- Homepage with search (buy/rent, locality, type, budget), categories, localities, services
- Property listing with filters, sorting and pagination; property detail with gallery, key facts,
  amenities, MahaRERA details, enquiry + site-visit request, shortlist, share, similar properties
- Enquiry forms for buyers (`/enquire/buy`), tenants (`/enquire/rent`), sellers and landlords
  (`/enquire/sell`, creates a **draft** listing for broker review), and a contact form
- Consent capture (wording stored with each enquiry), honeypot and rate limits against spam
- Privacy, terms and property-disclaimer pages (draft text — get legal review)

**Broker workspace** (`/dashboard`)
- **Overview**: live numbers, your tasks today, upcoming visits, uncontacted hot leads
- **Leads**: search (name, phone, email, locality, property), filters (stage, broker, score, source,
  dates), sorting, pagination, bulk assign/move with confirmation, CSV export (owners/admins, audited)
- **Lead detail**: qualification summary (score with reasons, missing info, next action, suggested
  follow-up), score override with recorded reason, requirements, ranked property matches with
  reasons, call/WhatsApp/email, activity log, tasks, site visits, consent, duplicate detection and
  merge (audited), stage changes with lost reason / deal values
- **Pipeline**: kanban with drag-and-drop and an accessible "Move to" control; server-validated
- **Tasks**: overdue / today / upcoming / snoozed; complete, snooze, reassign
- **Site visits**: week calendar, broker filter, double-booking prevention, outcomes, reschedule
- **Properties**: inventory with photo uploads, verify, publish (only after verification), stale
  listings flagged, owner submissions to review, interested leads
- **Reports**: every metric shows its definition and denominator; recorded vs projected brokerage;
  broker activity; click-through to the underlying leads
- **Reminders**: in-app notifications with unread badge
- **Team**: add members by email, roles, last-owner protection
- **Settings**: scoring points and Hot/Warm thresholds, follow-up timings, working hours,
  auto-assignment, website enquiries on/off, pipeline stages (rename, reorder, hide, add),
  "Run reminders now"

**Automation** (database-driven, idempotent)

| Event | What happens |
| --- | --- |
| New enquiry | Lead created or merged into the existing one (same mobile/email), scored, matched, assigned (listing broker, else least-loaded broker), first-contact task due within working hours |
| Call / WhatsApp / email logged | First contact recorded, stage moves to Contacted, first-contact task closed, follow-up task scheduled |
| No first contact | Reminder to the broker (scheduled job) |
| Task due today | In-app + email reminder once a day |
| Task overdue past the escalation window | Flagged, owners/admins and broker alerted |
| Site visit scheduled | Confirmation + reminder tasks, stage → Site Visit Scheduled |
| Visit time passed with no outcome | "Record outcome" task |
| Visit attended / no-show / cancelled | Visit tasks closed, follow-up or reschedule task, stage → Site Visit Completed |
| Lead moved to Negotiation | Negotiation follow-up task |
| Lead Won or Lost | Open follow-ups cancelled; Lost needs a reason |
| Listing not verified for N days | Re-verification task |

Every automated task and notification has a unique dedupe key, so retries and overlapping runs
never create duplicates. Nothing is ever sent to leads automatically: WhatsApp is click-to-chat by
the broker (see `src/lib/notify/whatsapp.ts` for the Business API adapter boundary).

### Roles

| Role | Can do |
| --- | --- |
| **Owner** | Everything, including owners/admins and organization settings |
| **Admin** | Inventory, all leads, assignment, bulk actions, export, settings, brokers and read-only managers |
| **Broker** | Only leads assigned to them (and their tasks/visits); reads inventory |
| **Read-only manager** | Views all records and reports; changes nothing |

Enforced in the database (RLS policies, triggers, checked functions) — not just hidden in the UI.

---

## Setup

### 1. Database (Supabase SQL Editor)

Run the files in `supabase/migrations/` **in filename order**:

1. `20261024120000_core_schema.sql`
2. `20261024120100_security.sql`
3. `20261024130000_business_logic.sql`
4. `20261024130100_storage.sql` (photo bucket + upload rules)
5. `20261024130200_member_lookup_fix.sql`

If you already ran 1–2 for Phase 1, just run 3–5. With the Supabase CLI: `supabase link` then
`supabase db push`.

Supabase's Security Advisor will flag `public_properties` and `public_property_media` as *security
definer views*. That is intentional: visitors read published listings without any access to the
underlying tables, and only safe columns are exposed.

### 2. Authentication settings

**Authentication → URL Configuration**: Site URL = your live URL; add `https://<your-site>/auth/callback`
and `http://localhost:3000/auth/callback` to Redirect URLs. Keep "Confirm email" on. Add your own
SMTP before launch (Supabase's built-in sender is rate-limited).

### 3. Environment variables

`.env.local` in this folder is already filled with your Supabase URL and anon key (safe to be
public; RLS protects the data). It is git-ignored. For other settings see `.env.example`.

| Variable | Needed for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Everything |
| `NEXT_PUBLIC_SITE_URL` | Email confirmation links |
| `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_CONTACT_*`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_RERA_AGENT_NUMBER` | Public contact details (blank = hidden) |
| `SUPABASE_SERVICE_ROLE_KEY` (server only) | `/api/cron/reminders` email job |
| `CRON_SECRET` | Protects `/api/cron/reminders` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Reminder emails (otherwise marked "skipped") |
| `ENQUIRY_IP_SALT` | Salt for hashed IPs used in rate limiting |
| `NEXT_PUBLIC_SITE_ORG_ID` | Only if one Supabase project hosts several brokerages |

**Never put the service-role key in a `NEXT_PUBLIC_` variable or commit it.**

### 4. Run

```bash
npm install
npm run dev        # http://localhost:3000
```

Sign up at `/signup`, confirm the email, create your brokerage (you become the owner). Brokers sign
up, then you add them on **Team**. Optional: run `supabase/seed/demo_listings.sql` for sample
listings (clearly labelled "Demo listing"; delete before launch).

### 5. Turn on scheduled automation

**Recommended — Supabase pg_cron** (runs every 15 minutes, no extra keys):

1. Database → Extensions → enable **pg_cron**
2. SQL Editor:
   ```sql
   select cron.schedule('brokerage-automation', '*/15 * * * *', $$select public.run_automation()$$);
   ```

**Reminder emails** are delivered by `/api/cron/reminders`. `vercel.json` schedules it daily at
09:00 IST (Vercel Hobby allows daily crons; Pro allows more often). Set `CRON_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` and `EMAIL_FROM` in Vercel. Without email keys,
in-app reminders still work and emails are marked "skipped".

Owners/admins can also press **Settings → Run reminders now** at any time.

---

## Deploy (Vercel)

1. Push this folder to a GitHub repo, import it in Vercel (framework: Next.js).
2. Add the environment variables (at least the two Supabase ones and `NEXT_PUBLIC_SITE_URL`).
3. Deploy, then add the Vercel URL to Supabase's Site URL / Redirect URLs.

> GitHub Pages can't host this app: it needs a server (sign-in, server actions, cron route).

---

## Tests

```bash
npm run typecheck && npm run lint
npm test             # 34 unit tests: permissions, validation, qualification, phone/price formatting
npm run test:db      # 56 database tests on a throwaway Postgres (needs Postgres 15+ binaries)
npm run test:e2e     # 9-step browser journey (needs the app running against a local Supabase)
```

- **Database tests** recreate Supabase's roles and a locked-down `auth.users`, apply the migrations
  as a non-superuser, then check: cross-organization isolation, every role's permissions, team
  rules, anonymous access, enquiry intake (validation, duplicates, rate limits, consent, owner
  drafts), scoring, matching, stage rules, visits and double-booking, merge, settings, reports,
  notifications, and that the scheduled job is idempotent.
- **End-to-end test** (`tests/e2e/journey.spec.ts`): owner signs up → creates brokerage → adds,
  verifies and publishes a listing → a visitor enquires and requests a visit → the lead is scored
  Hot 100 with reasons and matched → call logged → visit scheduled → pipeline move (Lost needs a
  reason) → reports, automation, reminders → broker joins and sees only their own leads →
  CSV export → cron endpoint protected. It was run against real Supabase Auth (GoTrue) and
  PostgREST; to run it yourself use `supabase start`, apply migrations, enable email auto-confirm,
  start the app and set `E2E_BASE_URL`.

---

## Architecture notes

- **Multi-organization**: every table has `org_id`; RLS checks membership on every row; triggers
  block cross-organization links and `org_id` changes.
- **Public intake** goes only through `submit_enquiry()` (validated, rate-limited, consent required).
  Visitors have no table access.
- **Scoring** is configurable rules with stored per-rule reasons; never uses personal characteristics.
  Overrides require a reason and are audited.
- **Audit log**: lead created/stage/reassign/override/delete/merge, exports, team and settings changes.
- **Timezone**: Asia/Kolkata by default; working hours apply to task due times.
- **Privacy**: only a salted hash of the visitor's IP is stored (rate limiting); CSV export escapes
  formula injection; private address and internal notes never reach public views.

```
src/app/(public)/       website: home, properties, property detail, enquire, shortlist, contact, legal
src/app/(auth)/         login, signup, onboarding
src/app/dashboard/      workspace screens
src/app/actions/        server actions (validated with Zod, permissions re-checked by the database)
src/app/api/cron/       scheduled reminder/email job
src/lib/                Supabase clients, auth, permissions, CRM queries, qualification, notify adapters
supabase/migrations/    schema, security, business logic, storage
tests/unit, tests/db, tests/e2e
```

## Before launch — needed from the business

- Brokerage name, logo, contact details, MahaRERA agent number
- Real listings with photos you own or are licensed to use (delete demo listings)
- Your own SMTP (Supabase Auth) and Resend account for reminder emails
- A verified WhatsApp Business number if you want the WhatsApp button
- Legal review of privacy policy, terms and disclaimer (DPDP Act 2023, MahaRERA, consumer law),
  plus your data retention and deletion process
- Backups: enable Supabase's daily backups / Point-in-Time Recovery on a paid plan
