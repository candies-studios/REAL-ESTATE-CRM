# Navi Estates — real estate brokerage platform

Lead generation, buyer qualification, CRM pipeline, site visits and broker follow-ups for a
property brokerage in Navi Mumbai. Built with **Next.js 15 (App Router) + TypeScript + Tailwind CSS v4**
on **Supabase** (Postgres, Auth, Row Level Security). Deploys to **Vercel**.

> "Navi Estates" is a working name. Change it with `NEXT_PUBLIC_BRAND_NAME`; colours live in
> `src/app/globals.css` and the logo in `src/components/ui/card.tsx`.

---

## What's in Phase 1 (this release)

| Area | Status |
| --- | --- |
| Design system (navy / ivory / gold / stone, Fraunces + Inter, self-hosted fonts) | ✅ |
| Public site: homepage, property search & listing, contact, legal pages | ✅ (listings read live from the database; empty until you publish properties) |
| Full database schema for all phases (17 tables) with migrations | ✅ |
| Row Level Security + organization isolation + role rules | ✅ tested — 28 database tests |
| Sign up, email confirmation, sign in, sign out | ✅ |
| Brokerage setup (creator becomes owner, 12 pipeline stages seeded) | ✅ |
| Broker workspace shell, live overview numbers, role-aware navigation | ✅ |
| Team management: add by email, change role, remove (with last-owner protection) | ✅ |
| Leads, pipeline, properties, visits, tasks, reports screens | Planned (phases 2–6). Tables and access rules already exist. |

### Roles

| Role | Can do |
| --- | --- |
| **Owner** | Everything, including managing owners and admins and organization settings |
| **Admin** | Manage inventory, all leads, assignments, pipeline stages, brokers and read-only managers |
| **Broker** | Work only on leads assigned to them; read the organization's inventory |
| **Read-only manager** (`viewer`) | View all of the organization's records; change nothing |

These rules are enforced **in the database** (RLS policies, triggers and checked functions), not just
by hiding buttons. `src/lib/permissions.ts` mirrors them only to shape the interface.

---

## Setup

### 1. Supabase

1. In your Supabase project, open **SQL Editor** and run the two files in `supabase/migrations/`
   **in order** (`…120000_core_schema.sql`, then `…120100_security.sql`).
   Or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.
2. **Authentication → URL Configuration**
   - Site URL: your live URL (e.g. `https://your-app.vercel.app`)
   - Redirect URLs: add `https://your-app.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`
3. **Authentication → Providers → Email**: keep "Confirm email" on (recommended).
   Supabase's built-in email sender is rate-limited; add your own SMTP before launch.

> Supabase's Security Advisor will flag `public_properties` as a *security definer view*. That is
> intentional: it lets visitors read published listings **without** any access to the `properties`
> table, and it exposes only safe columns (no private address or internal notes).

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API) and
`NEXT_PUBLIC_SITE_URL`. Contact details are optional; anything left blank is hidden, never invented.
**Never put the service-role key in a `NEXT_PUBLIC_` variable.**

### 3. Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:3000
```

### 4. First use

1. Go to `/signup`, create your account, and confirm the email.
2. You land on **Set up your brokerage**. Enter the name; you become the owner.
3. Brokers sign up themselves, then you add them on **Workspace → Team** by email with a role.

---

## Checks

```bash
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm test             # unit tests (permissions, validation, phone normalisation)
npm run test:db      # database security tests (needs local Postgres 15+ binaries)
npm run build        # production build
```

`npm run test:db` starts a throwaway Postgres, recreates Supabase's roles and `auth.uid()`, applies
the migrations as a **non-superuser**, and checks cross-organization isolation, every role's
permissions, team rules, anonymous access, the audit trail and duplicate-task prevention.

---

## Deploy (Vercel)

1. Push this repo to GitHub and import it in Vercel (framework: Next.js; no settings to change).
2. Add the environment variables from `.env.example` under **Project → Settings → Environment Variables**.
3. Deploy, then put the Vercel URL into Supabase's Site URL and Redirect URLs (step 1.2 above).

---

## Architecture notes

- **Multi-organization from day one.** Every business table has `org_id`; RLS checks membership on
  every row. Triggers stop records being linked across organizations (for example, attaching a
  note to another brokerage's lead) and stop `org_id` being changed.
- **Membership changes go through database functions** (`create_organization`,
  `add_member_by_email`, `set_member_role`, `remove_member`). Nobody can edit `user_roles` directly.
- **Public visitors get no table access.** They read listings through the `public_properties` view.
  Phase 2 adds a validated, rate-limited `submit_enquiry` function for public forms.
- **Audit log.** Lead creation, stage changes, reassignment, score overrides, deletion and team
  changes are recorded by triggers. Clients can read it (owners/admins) but never write it.
- **Idempotent automation.** `tasks.dedupe_key` and `notification_logs.dedupe_key` are unique, so
  retried jobs can't create duplicate tasks or messages.
- **Timezone.** Organizations default to `Asia/Kolkata`; dashboard "today" uses it.
- **Demo data must be labelled.** `properties.is_demo` shows a "Demo listing" badge publicly.

### Project layout

```
src/app/(public)/      homepage, properties, contact, legal
src/app/(auth)/        login, signup, onboarding
src/app/dashboard/     broker workspace (overview, team, planned modules)
src/app/actions/       server actions (auth, organization, team)
src/lib/               supabase clients, auth helpers, permissions, validation
supabase/migrations/   database schema + security (source of truth)
supabase/tests/        local stand-in for Supabase's auth schema (tests only)
tests/unit, tests/db   automated tests
```

---

## Roadmap

| Phase | Delivers |
| --- | --- |
| **2 — Lead generation** | Property detail pages; buyer, seller/landlord and rental enquiry forms; consent capture; `submit_enquiry` function with validation, duplicate detection and rate limiting; confirmation screens |
| **3 — CRM** | Lead table with search/filters/pagination, kanban pipeline with server-validated moves, lead detail and activity timeline, configurable qualification scoring with explanations and overrides, assignment, merge, CSV export |
| **4 — Inventory & visits** | Property manager with photo uploads (Supabase Storage), publish/verify workflow, buyer-to-property matching with reasons, site-visit calendar, conflicts and outcomes |
| **5 — Automation** | Follow-up and reminder rules, scheduled jobs (Vercel Cron), escalation, email via Resend once configured, optional WhatsApp via an approved Business API provider |
| **6 — Analytics** | Dashboard metrics with stated definitions and denominators, drill-downs, recorded vs projected revenue |
| **7 — Production readiness** | End-to-end tests, security review, performance and accessibility passes, backups and data-request runbooks |

## Needed from the business owner

- Brokerage name, logo and contact details (phone, email, office address)
- MahaRERA agent registration number, if registered
- Verified WhatsApp Business number (optional) and email provider (Resend) for Phase 5
- Real listings with photos you're licensed to use, and authentic testimonials if you want them shown
- Legal review of the privacy policy, terms and disclaimer (`src/app/(public)/legal/[slug]/page.tsx`)
  against the DPDP Act 2023, MahaRERA and consumer protection rules
