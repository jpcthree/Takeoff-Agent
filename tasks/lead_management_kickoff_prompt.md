# Kickoff Prompt — Home Services Lead Management System

> Copy everything below the line into a new Claude Code (or equivalent agent) session to kick off the build. Edit the **Company Context** block first with your real details.

---

## Role

You are a senior full-stack engineer and product designer. You are building a production-ready **Lead Management System** for a home services company. Your job is to (1) propose a concrete architecture and tech stack, (2) confirm assumptions with me before coding, (3) ship the system in phased, verifiable increments, and (4) prove each phase works before moving on.

Enter plan mode before writing code. Do not skip verification steps.

---

## Company Context (FILL THIS IN)

- **Company name:** _[e.g., Acme Home Services]_
- **Services offered:** _[e.g., roofing, gutters, windows, HVAC]_
- **Service area:** _[cities / zip codes]_
- **Team size:** _[# CSRs, # salespeople/estimators, # admins]_
- **Named salespeople (seed the leaderboard):** _[Alice, Bob, Carol …]_
- **Company email for lead-ready notifications:** _[ops@example.com]_
- **Existing tools we may integrate later (not now):** _[e.g., ServiceTitan, JobNimbus, HCP, HubSpot]_
- **Preferred hosting:** _[Vercel / AWS / Azure / self-hosted / no preference]_
- **Budget/latency expectations for the AI conversation agent:** _[e.g., "GPT-class quality, <3s response, cost-sensitive"]_

---

## Goals & Success Criteria

1. **Zero leads lost.** Every inbound lead from any supported channel lands in the system within 60 seconds with its source correctly tagged.
2. **Every lead gets a first touch within 2 minutes**, automated by an AI agent that qualifies and warms the lead via SMS/email.
3. **Single pane of glass** for CSRs, salespeople, and leadership — no spreadsheet sprawl.
4. **Measurable conversion funnel** from Lead → Won, sliceable by source and by salesperson.
5. **Gamified sales floor** — a live leaderboard with a monthly prize is visible to the whole team.
6. **Replaceable CRM layer.** The data model must be clean enough that we can later sync to a real CRM/job-management system without a rewrite.

---

## User Roles

- **CSR / Intake:** Monitors the Leads tab, reviews AI-qualified leads, schedules appointments.
- **Salesperson / Estimator:** Works their own pipeline tab, runs estimates, marks Won/Declined, enters job value.
- **Sales Manager / Admin:** Sees the full dashboard, assigns leads, manages the leaderboard prize, configures sources and users.
- **AI Agent (system):** Auto-contacts new leads, asks qualifying questions, returns structured data to the lead record.

RBAC: salespeople see only their own leads by default; managers see everything.

---

## Core Features

### 1. Multi-channel Lead Intake (auto-tagged by source)

Support at minimum:
- **Meta (Facebook/Instagram) Lead Ads** — webhook ingestion
- **Google Ads / Local Services Ads** — webhook or CSV/email parse
- **Website form fills** — hosted embeddable form + API endpoint
- **Inbound calls** — manual entry screen for CSRs, plus webhook hook for a future telephony integration (Twilio/CallRail placeholder)
- **Referrals** — manual entry with "referred by" field
- **Manual entry** — generic fallback

Each lead record stores: `source`, `source_campaign`, `source_medium`, raw payload, created_at, first_touch_at.

### 2. AI Qualification Agent (Conversations tab)

- Triggered immediately on lead creation.
- Sends SMS (and/or email) introducing the company and asking 4–7 qualifying questions (service needed, property type, urgency, budget sensitivity, preferred contact window, best time for estimate).
- Conversation history renders in a **Conversations tab**, threaded per lead.
- Agent should support graceful human handoff — a CSR can "take over" a conversation at any time and the AI stops replying.
- When the qualifying flow completes (form-fill equivalent), the system **emails the company inbox**: _"Lead ready to be scheduled: {name} / {service} / {summary}"_ with a deep link into the lead.
- Store extracted structured fields back onto the lead (e.g., `service_requested`, `urgency`, `property_type`).

### 3. Scheduling & Calendar

- CSR schedules an on-site estimate from the lead detail view.
- Appointment requires: date/time, duration, assigned estimator, address, notes.
- Appointments live in a **Calendar tab** (month/week/day views).
- Assigning an estimator automatically routes the lead into that salesperson's pipeline tab.
- Send calendar invites (ICS) to estimator + customer email.

### 4. Per-Salesperson Pipeline Tabs

- Each salesperson has their own tab showing only their leads, in a kanban board keyed by stage.
- Drag-and-drop to change stage. Inline edit for notes and job value.
- Filter/sort by source, age, estimated value.

### 5. Lead Stages & Status

Canonical pipeline:

```
Lead → Contacted → Scheduled → Estimated → Won | Declined
```

- `Dead` is a terminal flag that can be set from **any** stage (with a reason code: unresponsive, wrong number, out of area, price, timing, duplicate, other).
- Stage changes are audit-logged (who, when, from → to).
- Moving to `Won` requires entering a **job value (USD)** — this is the manual stand-in until CRM integration.
- Moving to `Declined` requires a reason code.

### 6. Dashboard Tab (leadership view)

Metrics (filterable by date range, source, salesperson):
- Lead volume by source
- Conversion rate at each stage transition (funnel)
- Avg time-to-first-touch, time-to-scheduled, time-to-won
- Revenue booked (sum of Won job values)
- Cost-per-lead placeholder (manual input per source per month) → CPL, ROAS once revenue is known
- Dead-lead reason breakdown

### 7. Gamified Leaderboard

- Live ranking of salespeople by **Won revenue this month** (configurable: by count, by revenue, or by a weighted score).
- Visible **monthly prize** block at the top of the leaderboard — admin-editable text + image.
- Resets at the start of each calendar month; archive prior months.
- **Alerts:**
  - Win alert: when a salesperson marks a lead Won, broadcast a celebratory toast/notification to all logged-in users ("🎉 Alice just won a $12,400 roof job!").
  - Periodic leaderboard digests (e.g., Monday 8am, Friday 4pm) via email and/or in-app notification.

### 8. Navigation / Layout

Left-hand sidebar, in this order:
1. **Leads** (all leads, default landing)
2. **Conversations**
3. **Calendar**
4. **My Pipeline** (auto-routes to the logged-in salesperson's tab; admins see a picker)
5. **Dashboard**
6. **Leaderboard**
7. **Settings** (users, sources, prize, notification prefs) — admins only

---

## Data Model (first draft — challenge it if you see improvements)

- `users` — id, name, email, role, phone, active
- `sources` — id, name, channel_type (meta|google|web|call|referral|manual), config_json
- `leads` — id, first_name, last_name, phone, email, address, service_requested, source_id, source_campaign, raw_payload, stage, dead_flag, dead_reason, assigned_user_id, created_at, first_touch_at, scheduled_at, estimated_at, closed_at, job_value_cents
- `lead_events` — id, lead_id, actor_user_id (nullable for system), type (stage_change | note | call | email | sms | assignment), payload_json, created_at
- `conversations` — id, lead_id, channel (sms|email|web), ai_active (bool)
- `messages` — id, conversation_id, direction (in|out), sender (ai|user|lead), body, created_at
- `appointments` — id, lead_id, estimator_user_id, starts_at, ends_at, address, notes, status
- `notifications` — id, user_id, type, body, read_at, created_at
- `leaderboard_prizes` — id, month (YYYY-MM), title, description, image_url

Audit every stage change via `lead_events`. Don't mutate stage without writing an event.

---

## Integrations (MVP vs later)

**MVP (stub with clean interfaces, wire real if easy):**
- Meta Lead Ads webhook → lead create
- Generic JSON webhook endpoint (Google/Zapier/anything) → lead create
- Website form endpoint → lead create
- Outbound email (Postmark/Resend/SES — pick one)
- Outbound SMS (Twilio) for the AI agent
- LLM provider (Claude via Anthropic SDK preferred — use prompt caching) for the conversation agent

**Explicitly deferred (leave adapter seams):**
- Phone/call tracking provider
- CRM / job management sync
- Payment / invoicing

---

## Non-Functional Requirements

- **Auth:** email+password or SSO (Google). Session-based or JWT — your call, justify it.
- **Multi-tenant:** not required for MVP (single company), but don't bake in assumptions that would block it later.
- **Timezone:** store UTC, render in company local tz (configurable).
- **Realtime:** leaderboard and win alerts should feel live (WebSocket or server-sent events, or polling every 15s as a fallback).
- **Mobile-friendly:** salespeople will use this on phones in the field. Responsive, not a separate app.
- **Observability:** structured logs, an `/admin/health` page, errors surfaced to admins — no silent failures.
- **Backups:** daily DB backup. Document the restore procedure.
- **Security:** hash passwords (argon2/bcrypt), HTTPS only, webhook signature verification, rate-limit public endpoints, PII in logs redacted.

---

## Suggested Tech Stack (propose alternatives if you disagree)

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + TanStack Query
- **Backend:** Next.js route handlers or a separate Node/TS API (Hono or Fastify)
- **DB:** Postgres (Supabase or Neon for managed); Prisma or Drizzle ORM
- **Auth:** Auth.js (NextAuth) or Supabase Auth
- **Realtime:** Supabase Realtime, Pusher, or a thin WS layer
- **Queue:** lightweight — Postgres-backed (pg-boss) or Upstash Q — for AI send, webhooks, digests
- **AI:** Anthropic Claude (use prompt caching on the system prompt + qualification script)
- **SMS/Email:** Twilio + Resend
- **Hosting:** Vercel (frontend) + managed Postgres, or a single Fly.io/Railway app

---

## Delivery Plan — Phased, Each Phase Must Be Demoable

**Phase 0 — Foundations (½ day):** repo, CI, DB schema migration, auth, empty app shell with the 7 sidebar tabs, seed users.

**Phase 1 — Leads in/out (1–2 days):** Lead model + CRUD, Leads tab list/detail, manual-entry form, generic webhook endpoint, source tagging, stage transitions with audit log, Dead flag.

**Phase 2 — AI Conversations (2–3 days):** Conversations tab, outbound SMS via Twilio, LLM-driven qualifier with 4–7 configurable questions, structured field extraction, company-email notification on qualification complete, human-handoff toggle.

**Phase 3 — Scheduling (1 day):** Calendar tab, appointment CRUD, estimator assignment routes lead into their pipeline, ICS invites.

**Phase 4 — Pipelines & Dashboard (2 days):** Per-salesperson kanban tab, Won requires job value, Declined requires reason, Dashboard tab with funnel + source breakdown + revenue.

**Phase 5 — Leaderboard & Alerts (1 day):** Live leaderboard, monthly prize block, win broadcast, scheduled digests.

**Phase 6 — Channel adapters (ongoing):** Meta Lead Ads webhook, Google Ads webhook/email parser, polish.

At the end of every phase: a short written demo script (what to click, what to expect) and screenshots or a Loom.

---

## Rules of Engagement

1. **Plan mode first.** Before you write code, produce a plan in `tasks/todo.md` with checkable items per phase. Get my sign-off on Phase 0 + Phase 1 before implementing.
2. **Ask before assuming** on anything in the Company Context block that's blank — don't invent.
3. **Verify before declaring done.** For each phase, run the app, exercise the happy path and one edge case in a browser, and share evidence (screenshots / network logs / DB rows). "Types compile" is not verification.
4. **Simplicity over cleverness.** No premature abstractions. No feature flags for things that don't exist yet. If three similar lines are clearer than a helper, leave them.
5. **Keep secrets out of the repo.** `.env.example` only; document every required env var.
6. **Log corrections.** If I correct an approach, update `tasks/lessons.md` so we don't repeat it.
7. **Flag tradeoffs explicitly.** When you choose between two reasonable designs, tell me what you picked and why in one sentence. Don't bury it.

---

## First Response I Want From You

Do **not** start coding yet. Respond with:

1. A numbered list of **clarifying questions** about anything blank or ambiguous in the Company Context block (max 10, prioritized).
2. Your **recommended stack** with a one-line justification per major choice, and any deviations from the suggested stack above.
3. A **Phase 0 + Phase 1 plan** written to `tasks/todo.md` with checkboxes — concrete enough that I can approve it and you can start.
4. A list of **risks / open design questions** you want me to weigh in on before Phase 2 (the AI agent phase) — especially around SMS compliance (10DLC registration, opt-out handling), message cadence, and fallback when the lead ghosts the AI.

Wait for my approval on the Phase 0/1 plan before writing any code.
