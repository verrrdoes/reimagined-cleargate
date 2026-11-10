# ClearGate

ClearGate is the end-of-term clearance system for one school (`cgateway.edu.ph`, Philippine time). Before students can enroll again, every school office has to clear them: Library, Accounting, Registrar, Guidance Office, Dean's Office and Property Custodian.

- Prospective students apply online; the Registrar approves the application, which creates the student account and opens a clearance for the current term.
- A clearance has one item per office. Each item is **needs action**, **pending** (the office is reviewing) or **approved**.
- Students upload evidence (PDF or image) for an item. Office staff review it against a per-office checklist and approve it or return it with a reason.
- Students and offices message each other about an item. Staff set deadlines and send reminders; automatic alerts go out 3 days before a deadline, within a day of it, and once it is overdue.
- A student is eligible to enroll when every item is approved.

This is version 2: the legacy PHP/MySQL app rebuilt as one Next.js application on Neon Postgres.

## Why there is no separate backend

ClearGate is one Next.js App Router application: Server Components read data, Server Actions handle form changes, and Route Handlers cover the few things that need a URL (file streaming, CSV downloads, polling, upload presigning and the cron tick). The workload is short request/response CRUD with small transactions; the only background work is a once-a-minute tick that is idempotent and runs as a protected route; chat and the bell poll instead of holding WebSockets; files go straight from the browser to object storage through presigned URLs, so the serverless body limit is never in the way; and there is one client and one team, so no separate versioned API is needed. If heavy jobs or a public mobile API appear later, add a job runner (Inngest, Trigger.dev, Upstash QStash) before building a separate backend.

## Stack

- Next.js 16 (App Router, Node.js runtime), React 19, TypeScript (strict)
- Neon Postgres through Prisma 7 (`@prisma/adapter-neon`; pooled URL at runtime, direct URL for migrations)
- Private S3-compatible bucket for files (Neon Object Storage or Cloudflare R2); a local-disk driver for development
- Resend for password-reset email (optional in development)
- bcryptjs, zod, lucide-react; Tailwind CSS 4 over CSS custom properties

## Run it locally

You need Node.js 20 or newer and a free [Neon](https://neon.tech) account.

1. **Create the database.** In the Neon console, create a project (region: Singapore, `ap-southeast-1`, is closest to Manila). Open **Connect** on the project dashboard and copy two connection strings for the same branch and database:
   - the **pooled** string (its host contains `-pooler`): this is `DATABASE_URL`;
   - the **direct** string (turn connection pooling off): this is `DIRECT_URL`.
2. **Set the environment.** Copy `.env.example` to `.env` and fill in at least `DATABASE_URL` and `DIRECT_URL`. Every variable is explained in that file. For a first run you can leave storage and email empty: files then go to `.data/uploads`, and reset links are printed in the terminal. Set `DEMO_MODE="1"` if you want the forgot-password page to fill in the reset code by itself.
3. **Install.** `npm install` (this also runs `prisma generate`).
4. **Create the tables.** `npx prisma migrate deploy` applies `prisma/migrations` through `DIRECT_URL`.
5. **Load the demo data.** `npx prisma db seed`. This **empties every table first** and then loads the demo school (accounts below), uploads the two demo PDFs to the configured storage, and sets the Library and Accounting deadlines 5 and 2 days from today at 5:00 PM.
6. **Start.** `npm run dev`, then open http://localhost:3000 (students) or http://localhost:3000/staff-login (staff and admins).

Check the database connection at any time with `GET /api/health`.

## File storage

Evidence files and application photos are student IDs and receipts, so the bucket must be **private**. The app never hands out public URLs: uploads use 5-minute presigned PUT URLs, and every download is streamed through a Route Handler that checks who is asking.

Any S3-compatible bucket works through the same five `S3_*` variables; no code changes between providers. Two good choices:

### Option A: Neon Object Storage (same project as the database)

Neon Object Storage is in **beta** and available in `aws-us-east-2`, `aws-us-east-1`, `aws-eu-central-1` and `aws-ap-southeast-1` (Singapore). Your Neon project must be in one of these regions. The free plan includes 5 GB per project.

1. In the Neon console, open your project, select the branch your `DATABASE_URL` points at, open **Object storage** and click **New bucket** (for example `cleargate-files`). Keep the access level **private** (the default; never `public_read`).
2. Open **Connect > Storage** and reveal the credential (or run `neon env pull --file .env.neon`). Neon shows four values named `AWS_*`; copy them into the app's names:
   ```
   S3_ENDPOINT="<AWS_ENDPOINT_URL_S3, e.g. https://br-....storage.c-2.ap-southeast-1.aws.neon.tech>"
   S3_REGION="<AWS_REGION, e.g. ap-southeast-1>"
   S3_BUCKET="cleargate-files"
   S3_ACCESS_KEY_ID="<AWS_ACCESS_KEY_ID>"
   S3_SECRET_ACCESS_KEY="<AWS_SECRET_ACCESS_KEY>"
   ```
   Don't set the `AWS_*` names themselves on Vercel: the app doesn't read them and Vercel reserves them for its own runtime. The secret is shown once; Neon credentials don't expire on their own, so rotate them under **Connect > Storage** if one leaks.
3. Set the CORS rule with `npm run storage:cors` (below). Neon has no CORS screen in the console; the script sets it through the S3 API.

Buckets belong to a **branch**, like the data. A branch created from `main` starts with `main`'s files (copy-on-write) and its changes stay on that branch, so a Neon dev branch gets matching files and rows. Always use the storage endpoint of the same branch as `DATABASE_URL`; otherwise file rows point at objects in another branch.

### Option B: Cloudflare R2

1. In the Cloudflare dashboard, open **R2** and create a bucket (for example `cleargate-files`). Leave public access off and don't enable an `r2.dev` URL or a custom domain.
2. Under **R2 > Manage R2 API Tokens**, create a token with **Object Read & Write** permission, limited to this bucket. Copy the access key ID and secret access key.
3. Set the variables:
   ```
   S3_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
   S3_REGION="auto"
   S3_BUCKET="cleargate-files"
   S3_ACCESS_KEY_ID="..."
   S3_SECRET_ACCESS_KEY="..."
   ```
4. Set the CORS rule with `npm run storage:cors` (below), or by hand in the bucket's **Settings > CORS Policy**:
   ```json
   [
     {
       "AllowedOrigins": ["https://cleargate.example.edu.ph", "http://localhost:3000"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   GET is not needed: downloads go through the app, not the bucket.

AWS S3 works the same way: leave `S3_ENDPOINT` empty, set `S3_REGION` to the bucket's region, block all public access, and add the same CORS rule.

### The CORS rule

Browsers upload straight to the bucket, so the bucket must allow `PUT` with a `Content-Type` header from your site. With the `S3_*` variables and `APP_URL` in `.env`, run:

```
npm run storage:cors
```

It allows `APP_URL` and `http://localhost:3000`, plus any extra origins you pass (`npm run storage:cors -- https://my-preview.vercel.app`), then prints the saved rule. Run it again whenever `APP_URL` changes. Without this rule, uploads fail in the browser with a CORS error while everything else works.

With `S3_BUCKET` empty the app uses the local-disk driver (`.data/uploads`, uploads go to `/api/uploads/local`). It is for development only and refuses to run on Vercel.

Run the seed **after** setting the storage variables for a deployed database, so the demo PDFs land in the bucket the app reads from.

## Email

Password resets email a link to `APP_URL/reset-password#token=…` that works once and expires in 30 minutes. Set `RESEND_API_KEY` (from resend.com) and a `MAIL_FROM` address on a domain you have verified in Resend. Without a key, nothing is sent: the server logs that email is not configured and, outside production, logs the link itself.

## Deploy to Vercel

1. Push the project to a Git repository and import it in Vercel (framework preset: Next.js). The default build command `npm run build` runs `prisma generate` and `next build`.
2. In **Project > Settings > Environment Variables**, add for Production (and Preview if you use it):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled connection string |
   | `DIRECT_URL` | Neon direct connection string (only used by Prisma commands, harmless at runtime) |
   | `APP_URL` | your production URL, e.g. `https://cleargate.example.edu.ph` |
   | `APP_SECRET` | long random string |
   | `CRON_SECRET` | another long random string |
   | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | the Neon Object Storage or R2 values above |
   | `RESEND_API_KEY`, `MAIL_FROM` | email settings |

   Leave `DEMO_MODE` unset (or `0`). It must never be `1` in production; a Vercel production deploy ignores it anyway.
3. Apply migrations to the production database before (or right after) the first deploy. From your machine, with `DIRECT_URL` in `.env` pointing at the production branch: `npx prisma migrate deploy`. If you prefer the deploy to do it, change the Vercel build command to `npx prisma migrate deploy && npm run build` and keep `DIRECT_URL` set in Vercel.
4. Seed only a new or demo database: `npx prisma db seed` erases all data first. Seeding once gives a fresh database its programs, offices, school year and an admin account; on a deployment for real use, sign in and change every demo password straight away.
5. With `APP_URL` set to the production URL, run `npm run storage:cors` so the bucket accepts uploads from it.

Neon point-in-time restore and branches replace the legacy Backups tab. Neon's Vercel integration can also create a database branch for each preview deployment.

## The scheduler (cron)

`GET /api/cron/tick` sends scheduled reminders that are due, the "deadline passed" notices to offices, and the automatic 3-day, 1-day and overdue alerts to students. It requires the header `Authorization: Bearer <CRON_SECRET>` (401 without it, 503 when `CRON_SECRET` is not set). Every step is idempotent, so extra calls do no harm. Scheduled reminders are meant to go out within about a minute of their time, so the tick should run every minute. Options:

- **Bell polling (built in).** Every signed-in page polls `GET /api/me` once a minute; that request also runs the tick when it hasn't run in the last 60 seconds (one shared `job_state` row decides). While anyone is signed in, this gives once-a-minute behaviour on any plan.
- **Vercel Cron, Hobby plan.** Hobby allows at most one run a day, so `vercel.json` runs the tick daily at `0 0 * * *` (midnight UTC, 8:00 AM Manila). Vercel sends the `CRON_SECRET` header for you.
- **Vercel Cron, Pro plan.** Change the schedule in `vercel.json` to `* * * * *` for a true per-minute tick.
- **cron-job.org or Upstash QStash (free tiers).** Create a job that runs every minute and calls `https://<your-domain>/api/cron/tick` with the header `Authorization: Bearer <CRON_SECRET>`.

To run it by hand: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/tick`. The reply lists what it did, for example `{"ok":true,"data":{"reminders":1,"reminderRecipients":12,"deadlinesPassed":0,"alerts":3,"failed":0,"term":"1st Semester, A.Y 2026 - 2027"}}`.

## Demo accounts

The seed's accounts follow the accounts snapshot of Oct 24, 2026 (same user IDs, emails and names). The snapshot has no passwords, so every student account uses the password `StudentCleargate2026!` and every staff and admin account uses `ClearGate2026!`. Students sign in at `/`, everyone else at `/staff-login`. Student names are stored in uppercase.

| Role | Sign in with | Name | Notes |
|---|---|---|---|
| Student | `tapnioariel@cgateway.edu.ph` or `2024-00123` | ARIEL TAPNIO | BSCS, 3rd year; 4 of 6 offices cleared |
| Student | `jamesloreto@student.example.edu` or `2026-01212` | JAMES DENVER LORETO | BSCS, 2nd year; no office has reviewed yet |
| Student | `bonjingberto@cgateway.edu.ph` or `2026-01213` | BERTO BONJING | BSCS, 3rd year; no office has reviewed yet |
| Student | `trinidadangelika@cgateway.edu.ph` or `2026-01214` | ANGELIKA TRINIDAD | BSIT, 4th year; no office has reviewed yet |
| Student | `maligrorei@cgateway.edu.ph` or `2026-01215` | REI MALIGRO | BSIT, 3rd year; no office has reviewed yet |
| Student | `bolivararvy@cgateway.edu.ph` or `2026-01216` | ARVY BOLIVAR | BSCS, 3rd year; no office has reviewed yet |
| Student | `marklopez@cgateway.edu.ph` or `2026-01217` | LOPEZ MARK | BSIT, 1st year; no office has reviewed yet |
| Student | `lopezmark@cgateway.edu.ph` or `2026-01218` | MARK LOPEZ | BSCS, 1st year; no office has reviewed yet |
| Staff, Library | `resosojustinlibrary@cgateway.edu.ph` | Justin Edelf Khalil Resoso | Head Librarian |
| Staff, Accounting | `maligrogerardoaccounting@cgateway.edu.ph` | Gerardo Maligro Jr. | Accounting Officer; has a receipt to review |
| Staff, Registrar | `bordeosjamesregistrar@cgateway.edu.ph` | James Bordeos | Registrar; also sees applications, reports and the audit log |
| Staff, Guidance | `tapnioyelguidance@cgateway.edu.ph` | Yel Tapnio | Guidance Counselor |
| Staff, Dean | `sundiamaldrindean@cgateway.edu.ph` | Aldrin Sundiam | Dean's Secretary |
| Staff, Property | `maritinitoeugeneproperty@cgateway.edu.ph` | Eugene Maritinito | Property Custodian |
| Admin | `loretodenveradmin@cgateway.edu.ph` | Denver Loreto | Every office, Settings and Staff Accounts |

Never keep these accounts or the shared passwords on a real deployment.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` | `prisma generate`, then a production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run db:deploy` | `prisma migrate deploy`: apply migrations (uses `DIRECT_URL`) |
| `npm run db:seed` | `prisma db seed`: erase all data and load the demo |
| `npm run db:migrate` | `prisma migrate dev`: create a new migration after changing `prisma/schema.prisma` (use a Neon dev branch) |
| `npm run db:reset` | `prisma migrate reset --force`: drop everything, re-apply migrations, re-seed |
| `npm run storage:cors` | Set the bucket's CORS rule so browsers can upload (see File storage) |

`npm install` runs `prisma generate` through `postinstall`. The Prisma client is generated into `generated/prisma` (not committed).

## Where things live

- `app/`: pages (`(auth)`, `(student)`, `(staff)`, `profile`, `change-password`) and Route Handlers under `app/api`
- `lib/actions/`: Server Actions; `lib/services/`: business rules (clearance items, notifications, reminders, the scheduler, …)
- `lib/auth/`: database-backed sessions and guards; `lib/files/`: storage drivers, upload tickets and file-type sniffing
- `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts`, `prisma/demo-files/`
- `docs/BUILD.md`: how the code is organised and the rules every server file follows

All times are stored as timestamps and shown in Asia/Manila time (fixed in `lib/time.ts`; the Philippines has no daylight saving time).
