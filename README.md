# View Movement – Client Success CRM

Lightweight Client Success CRM for the View Movement short-form video agency.
Dark-mode dashboard the CSM opens every morning: **Today's Actions** at the top, full client card grid below, per-client profile with full touchpoint log. Typeform → Google Sheets → Supabase auto-sync for new clients and cancellations.

## Stack

- **Frontend:** React (Vite) + Tailwind, Supabase Auth
- **Backend:** Node.js + Express + Supabase (service-role) + googleapis
- **Database:** Supabase (Postgres)
- **Hosting:** Railway (two services: `backend`, `frontend`), Supabase hosted externally

## Repo layout

```
view-movement-crm/
├── backend/                      # Express API + Sheets pollers
│   ├── src/
│   │   ├── server.js             # Express entry, mounts poller
│   │   ├── routes/clients.js     # /api/clients/* endpoints
│   │   ├── lib/                  # supabase, auth, cadence, clientOps, sheets
│   │   ├── jobs/
│   │   │   ├── onboardingSync.js     # polls Typeform sheet every 5 min
│   │   │   └── cancellationSync.js   # polls cancellation sheet every 5 min
│   │   └── seed/
│   │       ├── existingClients.js    # 36-client roster (from Apr 2026 PDF)
│   │       └── seedExistingClients.js
│   ├── supabase/schema.sql       # run once in Supabase SQL editor
│   ├── .env.example
│   └── railway.json
├── frontend/                     # Vite React app
│   ├── src/{pages,components,lib}
│   ├── .env.example
│   └── railway.json
└── README.md
```

## First-time setup

### 1. Supabase
1. Create a new Supabase project.
2. In SQL editor, paste `backend/supabase/schema.sql` and run.
3. Auth → Users → invite the two accounts with passwords:
   - `ty@viewmovement.com` (owner)
   - `content@viewmovement.com` (CSM)
4. Copy `Project URL`, `anon` key, and `service_role` key.

### 2. Google service account (for the pollers)
1. In Google Cloud Console, create a service account with **Viewer** access to Google Sheets API.
2. Generate a JSON key, grab the `client_email` and `private_key`.
3. Open each Google Sheet (onboarding + cancellation) and **Share → Viewer** to that service-account email.

### 3. Backend env (Railway)
Set the variables from `backend/.env.example`.

### 4. Frontend env (Railway)
Set the variables from `frontend/.env.example`.

### 5. Seed existing clients
Locally (or as a Railway one-off job):
```bash
cd backend
npm install
npm run seed
```
This upserts the 36 clients transcribed from the Monthly Client Churn Data PDF, sets their Loom timer as **already-due** (so each appears immediately in Today's Actions as a "New Loom Video" action), and starts their Call Offer timer on normal cadence.

## Running locally
```bash
# Backend
cd backend && npm install && npm run dev
# Frontend (new terminal)
cd frontend && npm install && npm run dev
```

## Cadence logic
- Every client has two independent timers: **Loom** and **Call Offer**.
- Intervals by status: Green 14d · Yellow 10d · Red 7d · Churned 7d (stays visible, pinned top).
- On day **-2** before due: surfaces as heads-up in Today's Actions.
- On due date and after: flagged overdue.
- Changing status recalculates `next_due_at` from `last_reset_at` using the new interval.
- One-time **Onboarding Check-in** reminder fires 7 days after record creation; dismissed permanently once an onboarding call is logged.

## Billing countdown
Each client has their own `billing_date` (1 or 14). The dashboard countdown ticks to that specific day of the month — not the nearer-of-the-two. Unset for now on imported clients; fillable from the profile view.

## Sync behavior
- **Onboarding poller** (every 5 min): reads `Onboarding Form` sheet; for each new row (deduped by the Typeform `Token`), creates a client with `status=green`, both timers starting immediately, onboarding reminder scheduled 7 days out.
- **Cancellation poller** (every 5 min): reads cancellation sheet; for each new row (deduped by `Token`), matches existing client by Email → Company, flips status to `churned`, logs a touchpoint with the cancellation reason. The client **stays visible**, pinned to the top for save-plan work.

## Required environment variables (Railway)

### Backend service
| Variable | Purpose |
| --- | --- |
| `PORT` | Railway sets automatically (default 8080) |
| `FRONTEND_ORIGIN` | CORS origin for the frontend URL |
| `SUPABASE_URL` | From Supabase project settings |
| `SUPABASE_ANON_KEY` | For JWT verification in `requireAuth` |
| `SUPABASE_SERVICE_ROLE_KEY` | Used server-side for DB writes |
| `ALLOWED_EMAILS` | `ty@viewmovement.com,content@viewmovement.com` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Private key with `\n` escapes |
| `ONBOARDING_SHEET_ID` | `17fd_Jhi7wXN0lgo0Z3CzWs4XDDz3zbAltPZALV1KKO4` |
| `ONBOARDING_SHEET_RANGE` | `Onboarding Form!A1:BQ` |
| `CANCELLATION_SHEET_ID` | `16c_iZfITqH9QKZLIuurblzDcmksXcCqcdXW_ISOrRZ8` |
| `CANCELLATION_SHEET_RANGE` | `View Movement Cancellation Form!A1:AY` |
| `ENABLE_POLLERS` | `true` (set `false` if running pollers externally) |

### Frontend service
| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Same as backend `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Same as backend `SUPABASE_ANON_KEY` |
| `VITE_API_URL` | The public URL of the backend Railway service |

## API surface
```
GET    /health
GET    /api/clients                 # full list with timers + last touchpoint
GET    /api/clients/today           # Today's Actions, urgency-sorted
GET    /api/clients/:id             # profile + timers + chronological touchpoints
POST   /api/clients                 # (internal) create
PATCH  /api/clients/:id             # update fields (handles status recalc)
POST   /api/clients/:id/action      # type: loom_sent | call_offered | call_completed
POST   /api/clients/:id/note        # add a note (logs as touchpoint)
POST   /api/clients/:id/timers/:timerType/reset
POST   /api/clients/:id/dismiss-onboarding
```
All routes except `/health` require a Supabase access token (Bearer header) whose email is in `ALLOWED_EMAILS`.

## Notes on the imported roster
- Status mapping from the PDF's A–F system:
  - A. Healthy → **green**
  - B. Watch → **yellow**
  - C. At Risk → **red**
  - D. Lost (Churn Inevitable) → **churned** (stays visible, pinned)
  - F. Onboarding / Too Early → **green** with `onboarding_flag = true`
- Package, content source, onboarding-call status are all `null` on imported rows — fill in from the profile view.
- Every imported client has a pending "New Loom Video" entry in Today's Actions on day one. Clicking **Loom Sent** clears it and starts the normal 14-day cadence.

## What success looks like (daily flow)
The CSM signs in, sees **Today's Actions**, works the list, clicks action buttons, adds notes, adjusts status if anything changes. New clients appear automatically when the Typeform is filled out. Cancellations flip clients to Churned automatically and pin them for save-plan work. By end of day, Today's Actions is clear.
