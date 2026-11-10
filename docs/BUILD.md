# ClearGate v2 build notes (read this first)

ClearGate is being rebuilt from the legacy PHP/MySQL app into **one Next.js app** (no separate backend) on **Neon Postgres via Prisma**. Several agents build it in parallel; this file is the shared contract. Follow it exactly so the pieces fit.

## Sources of truth

- **Spec:** `C:\Users\Momo\Desktop\DENVER\CS301 DENVER\codes\.vscode\cleargate-website\HANDOFF.md` (sections are cited as §N below). Port behaviour, validation rules, messages and notification texts **exactly** as written there.
- **Legacy code, for exact wording and behaviour the spec leaves out:** same folder: `api/index.php` (all routes; error messages), `assets/js/main.js` (UI behaviour, dialogs, copy), `*.html` (page structure and copy), `database/cleargate_db.sql` (schema, seed lines 621–731). Read only the parts you need.
- **Design direction:** `.taste-skill/direction.json` and `.claude/skills/design-taste-frontend/references/app-screens.md` (app-screen house rules). The legacy `styles.css` is **not** the design: the UI is being redesigned (see Design below).

## Ground rules

- **No local database and no running the app.** The owner will paste Neon URLs into `.env` later. Do not run `prisma migrate dev`, `prisma db push`, `prisma db seed`, `next dev` or Playwright. You *may* run `npx tsc --noEmit`, `npx eslint <your files>` and (integration phase only) `npx next build`. While other agents are working in parallel, the typecheck will show errors in files you don't own: fix only your own.
- **Only touch files you own** (see Ownership). If you need something from a file you don't own, code against the contract below; if the contract is missing something, add a small helper in a file you own and mention it in your final report.
- Windows machine; the shell is Git Bash or PowerShell. Paths in imports use the `@/` alias (project root).
- No git repo. Don't create one.

## Stack (installed; don't add dependencies without a strong reason)

- **Next.js 16.4** App Router, React 19.3, TypeScript 5.9 strict. Next 16 specifics: `cookies()`, `headers()`, `params` and `searchParams` are **async** (Promises); `middleware.ts` is now `proxy.ts` (we don't use one); Turbopack is the default; `next lint` is gone (run `npx eslint`). `refresh()` and `revalidatePath()` from `next/cache` refresh data after a Server Action. Bundled docs: `node_modules/next/dist/docs/`.
- **Prisma 7.10** with the `prisma-client` generator. Import the client and types from `@/generated/prisma/client` (e.g. `import type { Prisma, ItemStatus } from '@/generated/prisma/client'`). Never import that from a client component: use `lib/types.ts` unions there. Runtime connection goes through `@prisma/adapter-neon` (see `lib/db.ts`). `prisma.config.ts` holds the migration URL (`DIRECT_URL`). Schema: `prisma/schema.prisma` (done; don't change it without telling the integrator).
- zod 4, bcryptjs 3 (legacy hashes start `$2y$`; replace with `$2b$` before comparing), lucide-react (icons), @aws-sdk/client-s3 + s3-request-presigner (R2/S3), resend (email), server-only.
- **Tailwind CSS 4** (`@tailwindcss/postcss`, no Preflight) on top of CSS custom properties; `clsx` + `tailwind-merge` behind `cn()`. No CSS-in-JS, no UI libraries.

## Foundation that already exists (use it, don't rewrite it)

| File | What it gives you |
|---|---|
| `lib/env.ts` | `env()` (lazy, zod-validated), `isDemoMode()` (false on Vercel production), `appSecret()`, `isProductionDeploy()` |
| `lib/db.ts` | `db` (Prisma client, created lazily), types `Tx` (transaction client) and `Db` (either) |
| `lib/result.ts` | `Result<T>` envelope `{ok:true,data}` / `{ok:false,error:{code,message}}`, `ApiError`, `fail(status, code, message): never`, `ok()`, `runAction(fn)` for Server Actions, `route(fn)` for Route Handlers, `toError()`, `isUniqueViolation(e)` |
| `lib/time.ts` (client-safe) | Manila formatting: `prettyDue` ("Mon, Oct 26, 5:00 PM"), `formatDateTime`, `formatDate`, `formatWeekdayDate`, `formatTime`, `manilaYmd`, `manilaYear`, `toLocalInputValue`, `parseLocalDateTime` (datetime-local → Date, read as Manila), `parseYmd`, `manilaDayStart`, `addDays`, `timeAgo` |
| `lib/deadline.ts` (client-safe) | `spanText`, `dueState(due, status, nowMs)` → `{tone, text}`, `dueLine`, `countdownParts` (§10.5) |
| `lib/types.ts` (client-safe) | `RoleName`, `ItemStatus`, `Tone`, `TermName`, `Portal`, `NotificationView`, `ShellData`, `MePoll`, `OfficeRef` |
| `lib/constants.ts` (client-safe) | `TERM_LABEL`, `TERMS`, `termFrom()`, `ADMISSION_TYPES`, `CIVIL_STATUSES`, `OFFICE_ICONS`, `STATUS` (label + tone), `ITEM_STATUSES`, `SUBMISSION_BADGE`, `RETURN_REASONS`, `LIMITS`, `MB`, `CHECKLISTS`, `checklistFor(code)`, `PATTERNS` (phones, codes, postal, email), `SCHOOL_DOMAIN` |
| `lib/input.ts` (client-safe) | Legacy-style readers: `str(v,max)` (trim + cut), `clean(v,max)` (also collapses whitespace), `optStr`, `posInt`, `int`, `bool`, `oneOf`, `isEmail`, `cut`, `formObject(fd)` |
| `lib/ids.ts` | `randomHex`, `sha256Hex`, `tempPassword()`, `asciiSlug`, `pad`, `applicationReference(id, year)`, `submissionReference(officeCode, id, year)`, `schoolEmailBase`, `schoolEmail(base, n)` |
| `lib/request.ts` | `clientIp()`, `checkOrigin(req)` (call it first in every **mutating** Route Handler) |
| `lib/auth/session.ts` | `createSession(userId, remember)`, `readSession()` (cached per request), `destroySession()`, `deleteUserSessions(userId, tx?)`, `SessionUser` type (user + `staffProfile.office` + `student.program`), `sessionUserInclude` |
| `lib/auth/guards.ts` | Actions/handlers: `requireUser(roles?)`, `requireStaff()`, `requireAdmin()`, `requireRegistrar()`, `isRegistrar(u)`, `staffOfficeId(u)` (staff → office id or 403 `no_office`; admin → null), `itemOfficeWhere(u, officeCode?)` (Prisma `ClearanceItemWhereInput`), `actorOf(u)`, `displayName(u)`. Pages: `pageUser('student'|'staff')`, `anyPageUser()`, `registrarPage()`, `adminPage()` (redirect per §8.1), `portalHome(role)` |
| `lib/services/clearance.ts` | `loadCurrentTerm(tx?)`, `currentTerm()` (cached), `termText(t)` ("1st Semester, A.Y 2026 - 2027"), `defaultItem(officeName)`, `openClearance(tx, studentId, yearId, term)`, **`updateClearanceItem(tx, {...})`**, `summarize(items)`, `deadlineMap(yearId, term, tx?)`, `effectiveDue(item, map)` |
| `lib/services/notifications.ts` | `notifyUser(tx, userId, n)`, `notifyOffice(tx, officeId, includeAdmins, n)`, `notifyAdmins(tx, n)`, `excerpt(body)`, `notificationList(userId)` |
| `lib/services/adminLog.ts` | `logAdmin(tx, userId, action, details)`, `plural(n, word)` |

## Rules every server file follows

1. **Every Server Action and Route Handler calls its own guard** (`requireUser`/`requireStaff`/`requireRegistrar`/`requireAdmin`). Layout guards don't protect actions.
2. **Every clearance-item status change goes through `updateClearanceItem()`.** Never `clearanceItem.update({ data: { status } })` elsewhere.
3. Multi-step writes run in `db.$transaction(async (tx) => { ... })`.
4. Server Actions live in `lib/actions/<area>.ts` with `'use server'` at the top. Shape:
   ```ts
   export async function approveApplication(input: { id: number }): Promise<Result<AppDetail>> {
     return runAction(async () => {
       const user = await requireRegistrar();
       // validate with lib/input helpers + exact legacy messages → fail(400, 'code', 'Message')
       // ... db work ...
       revalidatePath('/applications');
       return data;
     });
   }
   ```
   Inputs are plain objects (validate everything; never trust types from the client). Return values must be serializable (Dates as ISO strings).
5. Route Handlers use `export const GET = route(async (req, ctx) => {...})`; mutating ones call `checkOrigin(req)` first. Dynamic params: `ctx: { params: Promise<{ id: string }> }`.
6. Error codes, HTTP statuses and messages come from the spec / legacy PHP (§3 table). Notification texts from §9, truncated with `cut()` (title 120, body 255). `logAdmin` details per the spec.
7. Times: store `Date` (timestamptz). Read `datetime-local` input with `parseLocalDateTime()`; "today" means the Manila day (`manilaYmd`, `manilaDayStart`). Show every time with `lib/time.ts`.
8. Security (§12): no `$queryRawUnsafe`; tagged `db.$queryRaw\`...\`` only. No `dangerouslySetInnerHTML` with user text. Never log passwords. Store only sha256 of tokens. Emails lowercased before storing/looking up.
9. Notification links are app paths: `/review/{id}`, `/applications/{id}`, `/messages?item={id}`, `/deadlines`.

## Contracts between areas (code against these even if the file isn't written yet)

**Shell (design agent):** `components/shell/AppShell.tsx` (server) `<AppShell data={ShellData}>{children}</AppShell>`; `lib/services/shell.ts`: `getShellData(user: SessionUser, portal: Portal): Promise<ShellData>`. `app/(student)/layout.tsx` and `app/(staff)/layout.tsx` already wrap pages in the shell, so **feature pages render only their sheet content** (title row and below). The top-bar search writes `?q=` onto the current URL on staff pages (pages that support search read `searchParams.q` or `useSearchParams().get('q')`); on student pages it navigates to `/requirements?q=`.

**UI kit (design agent), `components/ui/`:**
- `Icon` (`<Icon name="upload" size={16} />`, legacy keys from §10.4 + extras), `OfficeIcon` (`<OfficeIcon icon="book" />`)
- `StatusPill` (`<StatusPill status="needs_action" />`), `Pill` (`<Pill tone="action|pending|approved|overdue|info|muted">text</Pill>`)
- `Dialog` (client; native `<dialog>`): `<Dialog open onClose title description? footer? size?="sm|md|lg">children</Dialog>`
- `useToast()` (client) → `toast.success(msg)`, `toast.error(msg)`; `ToastProvider` is mounted in the root layout
- `Tabs` (links): `<Tabs items={[{ href, label, count? }]} current={href} />`
- `EmptyState` (`<EmptyState title body? action? />`), `Avatar` (`<Avatar name url size />`)
- `DueBadge` (client, refreshes every 30 s): `<DueBadge due={iso} status={ItemStatus} serverNow={iso} />`; `Countdown` (client, ticks each second): `<Countdown due={iso} serverNow={iso} />`
- `ClearanceSlip` (the signature element: one cell per office, filled by status): `<ClearanceSlip items={[{ officeCode, officeName, icon, status, approvedAt? }]} size="full|mini" />`
- `Logo` (flat SVG monogram + wordmark)
- Styling is Tailwind utilities. The shared kit lives in `components/ui/recipes.ts` as class strings and small functions; merge them with `cn()` from `components/ui/cn.ts` so a caller's utilities win.
- Buttons: `button()`, `button({ variant: 'primary' | 'danger' | 'ghost', size: 'sm', block: true })`, `iconButton()`, `linkButton`.
- Forms: `field`, `fieldLabel`, `fieldHint`, `fieldError`, `input`, `select`, `textarea`, `check` (checkbox row), `formGrid` (2 columns, stacks on phones), `formActions`.
- Layout: `pageHead` (title row: `h1` + `pageHeadSub` + `pageHeadActions` on the right), `toolbar` (search + filters + count), `panel()`, `kpis`/`kpi`/`kpiLabel`/`kpiValue`, `tableWrap` + `<table className={table}>` (`numCell`, `actionsCell`), `mono` (IBM Plex Mono: IDs and references only), `split` (two columns: main + 320px aside). Status: `alert(tone)`, `pill(tone)`, `tabs`/`tabLink`, `chips`/`chip`. Plain utilities for the rest: `text-muted`, `tabular-nums`, `flex flex-col gap-4`.

**Auth actions (infra agent), `lib/actions/auth.ts`:**
`signIn({ login, password, remember, portal }) → Result<{ redirectTo }>`; `signOut() → never` (redirects to `/` for students, `/staff-login` otherwise); `changePassword({ current, next }) → Result<{ redirectTo }>`; `forgotPassword({ email }) → Result<{ message, demoToken? }>`; `resetPassword({ token, password }) → Result<{ redirectTo }>` (`/?reset=1` or `/staff-login?reset=1`).

**Uploads (infra agent):** `POST /api/uploads/presign` body `{ kind: 'evidence', itemId, contentType, size } | { kind: 'photo', contentType, size }` → `{ url, method: 'PUT', headers, ticket }`. The browser PUTs the file to `url` with `headers`, then passes `ticket` to the finalize action. `lib/files/storage.ts`: `storage().put/get/head/readStart/remove`, `fileResponse({ key, mime, name, download, maxAge })` (streams with nosniff + private cache + safe Content-Disposition). `lib/files/ticket.ts`: `verifyTicket(ticket, expect: { kind, userId? }) → { key, kind, itemId?, contentType, size }`. `lib/files/sniff.ts`: `sniff(bytes)`, `safeFileName(name, ext)`, `EVIDENCE_MIMES`, `IMAGE_MIMES`. Client helper `lib/upload-client.ts`: `uploadFile(file, request) → Promise<{ ticket } | { error }>` (presign + PUT, with progress optional).

**Reminders (infra agent), `lib/services/reminders.ts`:** `deliverReminder(id, tellAuthor?) → number` (claim-by-update, §8.8). `lib/services/scheduler.ts`: `runTick()`, `maybeTick()`.

**Messages (staff-core agent):** `components/chat/ChatDialog.tsx` (client): `<ChatDialog itemId={number} open onClose title? viewer="student|office" />` polls `GET /api/messages?itemId=` every 10 s and sends with `POST /api/messages`.

**Student data (student agent):** `lib/services/student.ts`: `getStudentClearance(user)` → the §8.2 student payload (clearance summary + items with effective due, latest submission and message counts).

## Design (redesign; anti-AI-slop)

Dealt app style **framed-sheet** (`.taste-skill/direction.json`), kind *support*, light first, dark mode via `data-theme`.

- **Shell:** one tinted L-frame (228 px sidebar + 48 px top bar, same ground, no rule between them). Pages sit on a **white sheet** inset 8 px from the right and bottom, 1 px edge, 16 px radius, **no shadow**. Content padding 24 px. Below 1024 px the sidebar becomes a drawer; on phones the frame disappears and the sheet is the screen.
- **Tokens:** ground/frame `#f3f5f8` (blue-grey tint from the logo's blue), surface `#ffffff`, raised `#f4f6f8`, active `#e9edf2`, border `#e6e9ed`, rule `#f0f2f4`, control `#cdd1d6`, text `#131416`, muted `#5d6168`, **accent `#1565c0`** (the logo's blue; tab underline, focus, links, the one selected state, chart series 1). Positive `#1e7b4f`, negative `#c4242a`, warning `#92400e`. Primary button = ink (`#131416`, white text); dark mode flips it. Radius: card 8, control 6, sheet 16, pills 999. Control height 32, row 48, gap 24.
- **Status colours (pale pill + dark ink of the same hue):** needs action = orange (`#fff1e6`/`#9a3412`), pending = amber (`#fef6dc`/`#854d0e`), approved = green (`#dcfae5`/`#14532d`), overdue = red (`#ffedea`/`#831c1e`), info = accent tint (`#e8f0fb`/`#0d47a1`), muted = grey (`#eceef1`/`#3d4148`).
- **Type:** IBM Plex Sans 400/500/600 (next/font), IBM Plex Mono only for IDs and references (student numbers, `LIB-2026-0001`, `APP-…`). Title 22/600, section 16/600, body 14, small 12, KPI 28/400. Sentence case everywhere.
- **Dark mode:** true neutral (no navy): ground `#0f1012`, surface `#16171a`, raised `#1d1f23`, border `#26282c`, text `#f1f2f4`, muted `#a4a8af`, accent `#6aa5f0`. `localStorage` key `cg-theme`, applied before paint by an inline script in the root layout.
- **Signature element:** the *clearance slip*: one cell per office (icon, short name, a stamp when approved with the date, a dashed empty cell when pending, an orange outlined cell with "!" when it needs action). Large on the student dashboard; mini (six small squares) in staff rows.
- **Banned (house rules):** gradients of any kind (the owner asked for solid colours), glows, glassmorphism/backdrop blur, coloured shadows, icons in tinted squares/circles, eyebrow labels, UPPERCASE tracked labels, emoji, sparklines, decorative blobs, indigo/violet anywhere, cards nested 4 deep, invented numbers. No marketing copy inside the app: plain, specific words (the legacy copy is a good source).
- Tables: no card around them; 12 px muted sentence-case headers; 48 px rows; numbers right-aligned in tabular figures; one status pill per row. Empty states say what will appear and why.
- Accessibility: visible focus (2 px accent outline), skip link, `aria-*` on progress, tabs and timers, `prefers-reduced-motion`, works at 360 px wide.
- Tokens live in `app/globals.css` as CSS variables on `:root` (dark set on `[data-theme="dark"]`) and are exposed to Tailwind with `@theme inline`, so `bg-surface`, `text-muted`, `border-border` follow the theme with no `dark:` variant. Only the theme's names exist: colours, text sizes `text-10`…`text-40` (font-size only), radii `rounded-card|control|sheet`, spacing `h-control`, `h-row`, `p-pad`, `shadow-overlay`. Add a new name to both `globals.css` and the lists in `components/ui/cn.ts`. Never build a class name with `${}`; pick from a typed map instead. Area layouts shared by several files go in a small `layout.ts` next to the components (`components/student/layout.ts`, `components/profile/layout.ts`).
- Optional static check: `node .claude/skills/design-taste-frontend/scripts/lint.mjs <your dirs> --app`.

## Ownership

| Agent | Owns |
|---|---|
| **design-shell** (phase 1) | `app/globals.css`, `app/layout.tsx`, `app/not-found.tsx`, `app/error.tsx`, `components/ui/**`, `components/shell/**`, `lib/services/shell.ts`, `app/(student)/layout.tsx`, `app/(staff)/layout.tsx`, `app/profile/layout.tsx`, `app/(auth)/layout.tsx`, `app/(auth)/page.tsx` (`/` student sign-in), `app/(auth)/staff-login/**`, `app/(auth)/forgot-password/**`, `app/(auth)/reset-password/**` (UI calling the infra agent's auth actions; **not** signup or application-status), `app/change-password/**`, `public/img/**`, `app/icon.png` |
| **infra** (phase 1) | `lib/files/**`, `lib/upload-client.ts`, `lib/mail.ts`, `lib/actions/auth.ts`, `lib/services/reminders.ts`, `lib/services/scheduler.ts`, `app/api/uploads/**`, `app/api/me/**`, `app/api/notifications/**`, `app/api/health/**`, `app/api/cron/**`, `prisma/migrations/**`, `prisma/seed.ts`, `vercel.json`, `.env.example`, `README.md`, `next.config.ts`, `package.json` |
| **student** (phase 2) | `app/(student)/dashboard/**`, `app/(student)/requirements/**`, `app/(student)/clearance-status/**`, `components/student/**`, `lib/services/student.ts`, `lib/actions/evidence.ts` |
| **staff-core** (phase 2) | `app/(staff)/staff/**`, `app/(staff)/review/**`, `app/(staff)/history/**`, `app/(staff)/office-status/**`, `app/(staff)/messages/**`, `components/staff/**`, `components/chat/**`, `lib/services/review.ts`, `lib/services/messages.ts`, `lib/actions/review.ts`, `lib/actions/office-status.ts`, `app/api/messages/**`, `app/api/files/submissions/**` |
| **applications** (phase 2) | `app/(auth)/signup/**`, `app/(auth)/application-status/**`, `app/(staff)/applications/**`, `components/applications/**`, `lib/services/applications.ts`, `lib/actions/applications.ts`, `app/api/applications/**`, `app/api/files/application-photo/**` |
| **admin** (phase 2) | `app/(staff)/settings/**`, `app/(staff)/staff-accounts/**`, `app/(staff)/reports/**`, `app/(staff)/audit/**`, `components/admin/**`, `lib/services/settings.ts`, `lib/services/staff.ts`, `lib/services/reports.ts`, `lib/services/audit.ts`, `lib/csv.ts`, `lib/actions/settings.ts`, `lib/actions/staff.ts`, `app/api/reports/**`, `app/api/audit/**` |
| **deadlines-profile** (phase 2) | `app/(staff)/deadlines/**`, `app/profile/page.tsx`, `components/deadlines/**`, `components/profile/**`, `lib/services/deadlines.ts`, `lib/services/profile.ts`, `lib/actions/deadlines.ts`, `lib/actions/profile.ts`, `app/api/files/avatar/**` |
| **integrator** (phase 3+) | everything, to make it compile, lint and build |

## Decisions already made (don't re-decide)

- Hosting Vercel; database Neon (pooled `DATABASE_URL` at runtime via `@prisma/adapter-neon`, direct `DIRECT_URL` for migrations).
- Storage: private S3-compatible bucket (Cloudflare R2 recommended). With `S3_BUCKET` empty the app uses a local-disk driver in `.data/uploads` (development only; it refuses to run on Vercel).
- Email: Resend when `RESEND_API_KEY` is set; otherwise the reset link is only logged on the server (and returned as `demoToken` when `DEMO_MODE=1` outside production).
- Cron: `/api/cron/tick` protected by `Authorization: Bearer ${CRON_SECRET}`; `vercel.json` runs it daily (Hobby limit) and `maybeTick()` from `GET /api/me` (bell polling) gives once-a-minute behaviour while anyone is signed in. Document the per-minute option (Vercel Pro or cron-job.org).
- Keep the plaintext `applications.temp_password` for parity (§17 item 1), cleared on first password change.
- Backups tab dropped (Neon point-in-time restore).
- Pending List keeps the legacy year-not-term filter (§17 item 2). Alert wording keeps legacy stages (§17 item 4).
