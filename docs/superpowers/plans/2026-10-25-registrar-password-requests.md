# Password Requests the Registrar Approves: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student who forgot their password asks on the Forgot password page. The Registrar or an admin allows it after checking the student's school ID in person. The student then sets a new password on the device that asked.

**Architecture:**
- **Storage.** A new `password_requests` table (Prisma) holds requests. A request is tied to the device that asked by a secret; only the secret's sha256 hash is stored.
- **Student side.** Public Server Actions ask, cancel and set the password. A public Route Handler answers the student page's status checks every 15 seconds.
- **Staff side.** Registrar-only Server Actions allow, decline and withdraw. A new staff page lists the requests.
- **Pure logic.** The rules (state, token format, code format) live in one client-safe module covered by vitest. Everything that needs the database is checked in a headed-browser walk-through using fictional, temporary accounts.

**Tech Stack:** Next.js 16.4 App Router, React 19, TypeScript (strict), Prisma 7.10 on Neon Postgres, Tailwind 4, bcryptjs, vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-25-registrar-password-requests-design.md` (approved 2026-10-25). The mockup is next to it: `docs/superpowers/specs/2026-10-25-registrar-password-requests-mockup.html`.

## Global Constraints

### Setup and process

- **Next.js 16 has breaking changes.** Before writing Next code, read:
  - `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`
- **No git.** The project is not a git repository. There are no commit steps; don't create a repository.
- **Never run `prisma migrate reset`, `npm run db:reset` or `prisma migrate dev` against the database.** Apply the migration only with `prisma migrate deploy`, and only after the user says yes.
- **Don't stop the user's dev server** (`next dev`, port 3000).
- **Write code that reads like the code around it:** the same comment density, naming and idioms. Server Actions return `Result` through `runAction`/`fail`. Services start with `import 'server-only'`.

### Fixed values from the spec

- **Lifetimes:**
  - A request waits **24 hours**.
  - An allowed request is open for **15 minutes**.
- **The code:**
  - **6 characters** from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `O`, `0`, `I`, `1`).
  - Shown as two groups of three: `K7P 4QX`.
  - Stored in plain text.
- **The device secret:**
  - 32 random bytes as hex, carrying its own expiry: `<expiry ms in base 36>.<64 hex>`.
  - Only `sha256Hex(token)` is stored.
  - Sent only in request bodies, never in a URL.
  - Never logged.
- **New passwords:** 8 to 128 characters (counted with `Array.from`), bcrypt cost 12.
  - Error text: "Your new password needs 8 to 128 characters."
- **Who can ask:** only accounts with `role = 'student'` and `isActive = true`.
- **Who can decide:** `isRegistrar` users (Registrar office staff or admins). Actions use `requireRegistrar()`; the page uses `registrarPage()`.
- **Rate limits** (window `LIMITS.lockoutMinutes` = 15 minutes):
  - **3** requests per typed ID;
  - **10** requests per IP address.
  - Error text: `Too many requests. Try again in 15 minutes.`
- **One ending for every failure.** Declined, withdrawn, expired and cancelled all show the student the same text:
  - "This request is closed. If you still need a new password, ask again."
- **Never reveal whether an account exists**, whether by the reply to "ask", the status check, or the endings.
- **Never log** passwords, device secrets or codes. Audit details name the student and student ID only.
- **Audit actions:** `password_request.allow`, `password_request.decline`, `password_request.withdraw`, `password_request.used`. They show in the Audit log as **"Password request"**.
- **Names:** student names are shown as stored (UPPERCASE), as `LAST, FIRST`.

### Testing

- Never change a real student's password, and never act as a real staff member.
- Test only with a fictional temporary student and a fictional temporary Registrar staff account, created after the user says yes.
- Afterwards, remove them, their `password_requests` rows, their `login_attempts` rows and the `admin_actions` rows they caused.
- Walk through in the headed Playwright window. Then restore it: dark theme, 1280×800, on `/`.

## Review Focus

These are the inputs or conditions most likely to bite a real user that no unit test covers. Each one gets an explicit check in Task 6. Who owns the code:
- **1–3:** Task 3.
- **4:** Task 1 (token parsing) and Task 4 (storage).
- **5:** Task 1.

1. **The student saves after the 15 minutes ran out, or after staff pressed Withdraw.** The student gets the closed screen, and the password is unchanged.
2. **Staff press Allow on a request whose 24 hours passed while the list was open.** They get "This request has expired." and nothing changes.
3. **Allow is confirmed twice for the same request** (two tabs, or two staff members). The second gets "This request was already decided.", and there is only one approval.
4. **A damaged saved request in browser storage, or a malformed secret sent to the status check.** The ask form shows, nothing crashes, and the status check answers `closed`.
5. **The student types their ID with spaces or capital letters** (" 2026-00042 ", "SantosMaria@CGATEWAY.edu.ph"). It is matched after trimming and lowercasing.

---

### Task 1: Rules module, ID helpers, limits and vitest setup

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/passwordRequest.ts` (client-safe, no `server-only`, no `node:crypto`)
- Modify: `lib/ids.ts` (add two generators)
- Modify: `lib/constants.ts` (`LIMITS`)
- Test: `tests/passwordRequest.test.ts`

**Interfaces:**
- **Produces, from `lib/passwordRequest.ts`:**
  - `type PasswordRequestStatusName = 'pending' | 'approved' | 'declined' | 'used' | 'cancelled' | 'withdrawn'`
  - `type RequestState = 'waiting' | 'allowed' | 'closed'`
  - `const REQUEST_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'`
  - `const REQUEST_CODE_LENGTH = 6`
  - `const PASSWORD_REQUEST_CLOSED = 'This request is closed. If you still need a new password, ask again.'`
  - `function normalizeLogin(v: unknown): string`. Trims, lowercases and cuts to 190 characters; returns `''` for anything that isn't a string.
  - `function formatRequestCode(code: string): string`. `'K7P4QX'` → `'K7P 4QX'`.
  - `function parseRequestToken(v: unknown): { token: string; expiresAt: Date } | null`
  - `function requestState(r: { status: PasswordRequestStatusName; expiresAt: Date; approvedUntil: Date | null }, now: Date): RequestState`
- **Produces, from `lib/ids.ts`:**
  - `function requestCode(): string`
  - `function requestToken(expiresAt: Date): string`
- **Produces, added to `LIMITS`:**
  - `passwordRequestHours: 24`
  - `passwordRequestAllowMinutes: 15`
  - `passwordRequestsPerLogin: 3`
  - `passwordRequestsPerIp: 10`
  - `passwordRequestsList: 200`

- [ ] **Step 1: Add `vitest.config.ts`**

  The config needs:
  - `resolve.alias` mapping `@` to the project root (`path.resolve(import.meta.dirname)`);
  - `resolve.alias` mapping `server-only` to `node_modules/server-only/empty.js`, so server modules such as `lib/ids.ts` can be imported in tests;
  - `test.include: ['tests/**/*.test.ts']`;
  - `test.environment: 'node'`.

- [ ] **Step 2: Write the failing tests in `tests/passwordRequest.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { formatRequestCode, normalizeLogin, parseRequestToken, requestState, REQUEST_CODE_ALPHABET } from '@/lib/passwordRequest';
import { requestCode, requestToken } from '@/lib/ids';

const now = new Date('2026-10-25T02:00:00Z');
const later = (min: number) => new Date(now.getTime() + min * 60_000);

describe('normalizeLogin', () => {
  it('trims and lowercases', () => {
    expect(normalizeLogin('  2026-00042 ')).toBe('2026-00042');
    expect(normalizeLogin('SantosMaria@CGATEWAY.edu.ph')).toBe('santosmaria@cgateway.edu.ph');
  });
  it('rejects non-strings and cuts to 190', () => {
    expect(normalizeLogin(42)).toBe('');
    expect(normalizeLogin(null)).toBe('');
    expect(Array.from(normalizeLogin('a'.repeat(300)))).toHaveLength(190);
  });
});

describe('formatRequestCode', () => {
  it('splits into two groups of three', () => expect(formatRequestCode('K7P4QX')).toBe('K7P 4QX'));
});

describe('requestCode', () => {
  it('is 6 characters from the alphabet, no look-alikes', () => {
    for (let i = 0; i < 200; i++) {
      const c = requestCode();
      expect(c).toMatch(/^[A-Z2-9]{6}$/);
      for (const ch of c) expect(REQUEST_CODE_ALPHABET).toContain(ch);
      expect(c).not.toMatch(/[O0I1]/);
    }
  });
});

describe('requestToken / parseRequestToken', () => {
  it('round-trips the expiry and the full token', () => {
    const expiresAt = later(24 * 60);
    const token = requestToken(expiresAt);
    expect(token).toMatch(/^[0-9a-z]+\.[0-9a-f]{64}$/);
    expect(parseRequestToken(token)).toEqual({ token, expiresAt });
  });
  it('makes a different secret each time', () => {
    expect(requestToken(now)).not.toBe(requestToken(now));
  });
  it('rejects malformed tokens', () => {
    for (const bad of [null, 42, '', 'garbage', 'abc.123', `zz.${'g'.repeat(64)}`, `.${'a'.repeat(64)}`, `${'z'.repeat(12)}.${'a'.repeat(64)}`]) {
      expect(parseRequestToken(bad)).toBeNull();
    }
  });
});

describe('requestState', () => {
  const base = { expiresAt: later(60), approvedUntil: null };
  it('pending before expiry is waiting; after, closed', () => {
    expect(requestState({ ...base, status: 'pending' }, now)).toBe('waiting');
    expect(requestState({ ...base, status: 'pending', expiresAt: later(-1) }, now)).toBe('closed');
  });
  it('approved inside the window is allowed; after, closed', () => {
    expect(requestState({ ...base, status: 'approved', approvedUntil: later(5) }, now)).toBe('allowed');
    expect(requestState({ ...base, status: 'approved', approvedUntil: later(-1) }, now)).toBe('closed');
  });
  it('every other status is closed', () => {
    for (const status of ['declined', 'used', 'cancelled', 'withdrawn'] as const) {
      expect(requestState({ ...base, status }, now)).toBe('closed');
    }
  });
});
```

- [ ] **Step 3: Run them and check they fail**

  Run: `npx vitest run`
  Expected: FAIL, because the module `@/lib/passwordRequest` can't be resolved.

- [ ] **Step 4: Implement**

  - **`lib/passwordRequest.ts`:**
    - `parseRequestToken` accepts only `/^[0-9a-z]{1,11}\.[0-9a-f]{64}$/` whose expiry parses to a finite time.
    - `requestState`: `pending` with `expiresAt > now` → `waiting`; `approved` with `approvedUntil > now` → `allowed`; anything else → `closed`.
  - **`lib/ids.ts`:**
    - `requestCode()` uses `randomInt` over `REQUEST_CODE_ALPHABET`, the same way `tempPassword` does.
    - `requestToken(expiresAt)` returns `` `${expiresAt.getTime().toString(36)}.${randomHex(32)}` ``.
  - **`LIMITS`:** add the five values listed under Interfaces.

- [ ] **Step 5: Run the tests, the typecheck and lint, and check they pass**

  Run: `npx vitest run && npm run typecheck && npm run lint`
  Expected: all tests PASS, and tsc and eslint exit 0.

---

### Task 2: Data model and migration file (not applied yet)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0002_password_requests/migration.sql` (generated)

**Interfaces:**
- **Produces:**
  - the Prisma enum `PasswordRequestStatus { pending approved declined used cancelled withdrawn }`;
  - the model `PasswordRequest`, exactly as sketched in the spec ("Shape of the data"), plus two relations: `user User @relation("PasswordRequestUser", fields: [userId], references: [id], onDelete: Cascade)` and `decidedBy User? @relation("PasswordRequestDecider", fields: [decidedById], references: [id], onDelete: SetNull)`;
  - on `User`: `passwordRequests PasswordRequest[] @relation("PasswordRequestUser")` and `decidedPasswordRequests PasswordRequest[] @relation("PasswordRequestDecider")`.
  - `db.passwordRequest` becomes available in the generated client.

- [ ] **Step 1: Snapshot the current schema before editing**

  Run: `cp prisma/schema.prisma "<scratchpad>/schema.before.prisma"`

- [ ] **Step 2: Add the enum, the model and the two `User` relation fields** to `prisma/schema.prisma`

  Put the model after `PasswordReset`, with one-line comments in the schema's own style.

- [ ] **Step 3: Generate the migration SQL from the two schema files**

  This is offline and doesn't touch the database. Diffing against the live database would also drop the hand-written `uq_academic_years_one_current` index, so don't do that.

  Run: `mkdir -p prisma/migrations/0002_password_requests && npx prisma migrate diff --from-schema "<scratchpad>/schema.before.prisma" --to-schema prisma/schema.prisma --script -o prisma/migrations/0002_password_requests/migration.sql`

  Expected: the file contains only these statements:
  - `CREATE TYPE "PasswordRequestStatus"`;
  - `CREATE TABLE "password_requests"`;
  - a unique index on `token_hash`;
  - two indexes (`status, created_at` and `user_id`);
  - two foreign keys (`user_id` with cascade, `decided_by` with set null).

  Anything else is a mistake. Stop and find out why.

- [ ] **Step 4: Regenerate the client and typecheck**

  Run: `npx prisma generate && npm run typecheck`
  Expected: both exit 0.

  If the running dev server later serves a stale client, ask the user to restart it. Don't restart it yourself.

---

### Task 3: Server logic, student actions and the status route

**Files:**
- Create: `lib/services/passwordRequests.ts`
- Modify: `lib/actions/auth.ts` (three new actions)
- Create: `lib/actions/passwordRequests.ts` (three staff actions)
- Create: `app/api/password-requests/status/route.ts`

**Interfaces:**
- **Consumes:**
  - from Task 1: the whole `lib/passwordRequest.ts` module, `requestCode`, `requestToken` and the new `LIMITS`;
  - from Task 2: `db.passwordRequest`;
  - existing helpers: `sha256Hex`, `logAdmin(tx, userId, action, details)`, `deleteUserSessions(userId, tx)`, `clientIp()`, `checkOrigin(req)`, `route()`, `requireRegistrar()`.
- **Produces, from `lib/services/passwordRequests.ts`:**
  - `type AskReply = { code: string; token: string; expiresAt: string; login: string }`. `expiresAt` is ISO; `login` is the normalized login.
  - `type RequestStatusView = { state: RequestState; approvedUntil: string | null }`
  - `type PasswordRequestRow = { id: number; name: string; studentNumber: string; code: string; createdAt: string; state: 'waiting' | 'allowed'; approvedUntil: string | null }`
  - `askForPasswordChange(input: { login?: unknown }, ip: string): Promise<AskReply>`
  - `getPasswordRequestStatus(token: unknown): Promise<RequestStatusView>`
  - `cancelPasswordRequest(token: unknown): Promise<void>`
  - `completePasswordRequest(token: unknown, passwordHash: string): Promise<{ redirectTo: string }>`
  - `listPasswordRequests(): Promise<PasswordRequestRow[]>`
  - `decidePasswordRequest(actorId: number, input: { id?: unknown }, decision: 'allow' | 'decline' | 'withdraw'): Promise<void>`
- **Produces, from `lib/actions/auth.ts`:**
  - `requestPasswordChange(input: { login: string }): Promise<Result<AskReply>>`
  - `cancelPasswordChange(input: { token: string }): Promise<Result>`
  - `setPasswordFromRequest(input: { token: string; password: string }): Promise<Result<{ redirectTo: string }>>`
- **Produces, from `lib/actions/passwordRequests.ts`:**
  - `allowPasswordRequest(input: { id: number }): Promise<Result>`
  - `declinePasswordRequest(input: { id: number }): Promise<Result>`
  - `withdrawPasswordRequest(input: { id: number }): Promise<Result>`
- **Produces, the route:** `POST /api/password-requests/status`. Body `{ token }` → `{ ok: true, data: RequestStatusView }`.

- [ ] **Step 1: `askForPasswordChange`**

  1. `login = normalizeLogin(input.login)`. If it's empty, call `fail(400, 'missing_login', 'Enter your student ID or school email.')`.
  2. Check the rate limits in `login_attempts`:
     - rows with `login = 'pwreq:' + login`;
     - rows with this IP and `login` starting with `pwreq:`;
     - both counted since `now − LIMITS.lockoutMinutes`.

     If either limit is reached, call `fail(429, 'too_many_requests', …)` with the text from Global Constraints.
  3. Record the attempt with `succeeded: true`. Comment why: `signIn` counts `succeeded: false` rows per IP toward the sign-in lockout, and a computer lab shares one IP.
  4. Make `expiresAt` (now + 24 h), the token and the code.
  5. Look up the user: `findFirst({ where: { role: 'student', isActive: true, OR: [{ email: login }, { student: { is: { studentNumber: login } } }] } })`. Create a row only if there is one.
  6. Return the same `AskReply` shape either way.

- [ ] **Step 2: `getPasswordRequestStatus` and `cancelPasswordRequest`**

  **Status:**
  - If the token doesn't parse, return `{ state: 'closed', approvedUntil: null }`.
  - Look the row up by `tokenHash: sha256Hex(parsed.token)`.
  - **No row:** the state is `waiting` if `parsed.expiresAt > now`, otherwise `closed`.
  - **A row:** the state is `requestState(row, now)`. It is forced to `closed` if the user is no longer an active student.
  - `approvedUntil` is set only when the state is `allowed`.

  **Cancel:** `updateMany({ where: { tokenHash, status: { in: ['pending', 'approved'] } }, data: { status: 'cancelled' } })`. It never fails for unknown tokens.

- [ ] **Step 3: `completePasswordRequest`**

  1. Define `closed = () => fail(409, 'request_closed', PASSWORD_REQUEST_CLOSED)`.
  2. Load the row by its token hash, with the user (`role`, `isActive`) and the student (`firstName`, `lastName`, `studentNumber`). If there's no row, or the user isn't an active student, call `closed()`.
  3. In one `db.$transaction`, do these in order:
     1. Claim the request: `updateMany({ where: { id, status: 'approved', approvedUntil: { gt: now } }, data: { status: 'used', usedAt: now } })`. If the count isn't 1, call `closed()`.
     2. Update the user: `passwordHash`, and `mustChangePassword: false`.
     3. Clear the temporary password: `application.updateMany({ where: { userId }, data: { tempPassword: null } })`.
     4. Call `deleteUserSessions(userId, tx)`.
     5. Write the audit row: `logAdmin(tx, userId, 'password_request.used', `${name} (${studentNumber}) set a new password after the Registrar allowed it`)`.
  4. Return `{ redirectTo: '/?reset=1' }`.

- [ ] **Step 4: `listPasswordRequests` and `decidePasswordRequest`**

  **List:**
  - Rows where `OR: [{ status: 'pending', expiresAt: { gt: now } }, { status: 'approved', approvedUntil: { gt: now } }]` and the user is an active student.
  - Order by `createdAt` descending, take `LIMITS.passwordRequestsList`.
  - Map each row to `PasswordRequestRow`, with `name` as `` `${lastName}, ${firstName}` ``.

  **Decide:**
  - `id = posInt(input.id)`. If there's no id, no row, or the row's user isn't a student, call `fail(404, 'not_found', 'Password request not found.')`.
  - Everything runs in one transaction, with a conditional `updateMany` for each decision:

  | Decision | Where | Data | When the count is 0 | Audit |
  |---|---|---|---|---|
  | allow | `status: 'pending', expiresAt > now` | `approved`, `decidedById`, `decidedAt: now`, `approvedUntil: now + 15 min` | `409 request_expired` "This request has expired." if the row is pending and past `expiresAt`; otherwise `409 already_decided` "This request was already decided." | `password_request.allow`: `Allowed ${name} (${studentNumber}) to set a new password` |
  | decline | same as allow | `declined`, `decidedById`, `decidedAt` | same as allow | `password_request.decline`: `Declined the password request of ${name} (${studentNumber})` |
  | withdraw | `status: 'approved', approvedUntil > now` | `withdrawn`, `decidedById`, `decidedAt` | `409 already_closed` "This approval was already used or has run out." | `password_request.withdraw`: `Withdrew the password approval of ${name} (${studentNumber})` |

  - After a successful allow, in the same transaction, close the student's other open requests: `updateMany({ where: { userId, id: { not: id }, status: { in: ['pending', 'approved'] } }, data: { status: 'cancelled' } })`.

- [ ] **Step 5: The actions and the route**

  **Student actions,** in `lib/actions/auth.ts`, next to `resetPassword` and reusing its local `field`, `chars` and `hashPassword`:
  - `requestPasswordChange` passes `clientIp()` to the service.
  - `setPasswordFromRequest` checks the length first (`weak_password`, the same text as `resetPassword`), then hashes, then calls the service.

  **Staff actions,** in `lib/actions/passwordRequests.ts` (`'use server'`):
  - Each one is `runAction` → `requireRegistrar()` → `decidePasswordRequest(user.id, input, …)` → `revalidatePath('/password-requests')` → `null`.

  **The route** copies the body-parsing of `app/api/applications/status/route.ts`: `checkOrigin`, then `invalid_json` handling. It returns `getPasswordRequestStatus((body as { token?: unknown }).token)`.

- [ ] **Step 6: Typecheck, lint and tests**

  Run: `npm run typecheck && npm run lint && npx vitest run`
  Expected: all exit 0. The behaviour that touches the database is checked in Task 6.

---

### Task 4: The student's Forgot password flow

**Files:**
- Create: `components/shell/auth/RegistrarRequest.tsx` (the flow: storage, status checks, the ask, waiting and closed screens)
- Create: `components/shell/auth/RequestPasswordForm.tsx` (the "allowed" set-password form)
- Modify: `components/shell/auth/ForgotForm.tsx`

**Interfaces:**
- **Consumes:**
  - from Task 3: `requestPasswordChange`, `cancelPasswordChange`, `setPasswordFromRequest`, `AskReply`, `RequestStatusView` and `POST /api/password-requests/status`;
  - from Task 1: `formatRequestCode`, `parseRequestToken`, `PASSWORD_REQUEST_CLOSED`.
  - existing UI: `authCard`, `FormAlert`, `PasswordInput`, `PageLoading`, the recipes (`button`, `field`, `fieldLabel`, `fieldHint`, `fieldError`, `input`, `linkButton`, `spinner`, `mono`), `formatDateTime`, `formatTime`, `SCHOOL_DOMAIN`.
- **Produces:**
  - `RegistrarRequest({ onUseEmail }: { onUseEmail: () => void })`
  - `RequestPasswordForm({ token, approvedUntil, onClosed }: { token: string; approvedUntil: string; onClosed: () => void })`
  - the localStorage key `cg_password_request`, which holds `JSON` of `{ token, code, login, expiresAt }`.

- [ ] **Step 1: `RegistrarRequest`**

  **Restoring a saved request:**
  - Restore it from `cg_password_request` on the client. Use `useSyncExternalStore` with a `null` server snapshot, and show `PageLoading` until it's known, as `ResetForm` does.
  - Wrap every storage access in try/catch.
  - A saved entry whose token fails `parseRequestToken`, or whose JSON is damaged, counts as no entry and is removed.
  - If storage is blocked, keep the request in component state.

  **Status checks:**
  - While the state is `waiting` or `allowed`, check every **15 s**, and again **30 s** after an error.
  - Don't check while `document.hidden`. Check once more when the tab becomes visible again.
  - When the saved `expiresAt` passes, show the closed screen without asking the server.

  **Screens** (all inside `authCard`; the copy is fixed):
  - **Ask:**
    - Heading "Forgot password". Lead: "Ask the Registrar to let you set a new password. You'll show your school ID at the Registrar's office."
    - Field "Student ID or school email", placeholder `2026-00042 or name@${SCHOOL_DOMAIN}`.
    - Primary button "Ask the Registrar"; while pending, a spinner and "Sending…".
    - Under the form: "Can you open your email? <linkButton>Send a reset link instead</linkButton>" (calls `onUseEmail`).
    - Then "Remembered it? Back to sign in". `/` is the student sign-in page.
  - **Waiting:**
    - Heading "Go to the Registrar's office". Lead: "Bring your school ID and show this code to the Registrar."
    - The code, large: `formatRequestCode(code)` in the `mono` style, about 32 px, letter-spaced, centred, in a dashed box.
    - "Request for {login} · Open until {formatDateTime(expiresAt)}".
    - An info `FormAlert`:
      - when storage works: "This page changes by itself when the Registrar allows the change. Keep it open, or come back to Forgot password on this device.";
      - when storage is blocked: "Keep this page open until the Registrar allows the change."
    - A default button "Cancel request". It calls `cancelPasswordChange`, clears storage and goes back to Ask.
  - **Allowed:** `<RequestPasswordForm …/>`.
  - **Closed:**
    - Heading "Request closed".
    - An info `FormAlert` with `PASSWORD_REQUEST_CLOSED`.
    - Primary button "Ask again". It clears storage and goes back to Ask.

- [ ] **Step 2: `RequestPasswordForm`**

  It copies the fields, client checks and error handling of `ResetForm`:
  - "New password" with the hint "Use at least 8 characters.";
  - "Re-enter new password";
  - "Passwords do not match.";
  - focus moves to the field with the error.

  Heading "Set a new password". Lead: "The Registrar allowed the change. Choose a new password and sign in with it." A line: "Open until {formatTime(approvedUntil)}". Primary button "Save new password" ("Saving…" while pending).

  **On the reply:**
  - **Success:** clear storage and `router.replace(redirectTo)`.
  - **`request_closed`:** call `onClosed()`.
  - **`weak_password`:** show the error on the password field.
  - **Any other error:** show it in a `FormAlert` above the fields.

- [ ] **Step 3: `ForgotForm`**

  - **Student portal:** keep `mode: 'registrar' | 'email'` in state, starting at `'registrar'`. In `'registrar'` mode, render `<RegistrarRequest onUseEmail={() => setMode('email')} />`.
  - **The email form for students:** add "Can't open your email? <linkButton>Ask the Registrar instead</linkButton>" under the form.
  - **Staff portal** (`portal === 'staff'`): renders exactly as today.

- [ ] **Step 4: Typecheck and lint**

  Run: `npm run typecheck && npm run lint`
  Expected: both exit 0.

---

### Task 5: The Registrar's Password requests page, menu entry and Audit log label

**Files:**
- Create: `app/(staff)/password-requests/page.tsx`
- Create: `components/staff/PasswordRequestsTable.tsx`
- Modify: `components/shell/nav.ts`
- Modify: `lib/services/audit.ts` (`AUDIT_KINDS` and the `admin_actions` `CASE`)
- Modify: `app/(staff)/audit/page.tsx` (tone map)

**Interfaces:**
- **Consumes:**
  - from Task 3: `listPasswordRequests`, `PasswordRequestRow`, `allowPasswordRequest`, `declinePasswordRequest`, `withdrawPasswordRequest`;
  - from Task 1: `formatRequestCode`;
  - existing UI: `registrarPage()`, `ConfirmDialog` (`components/admin/ConfirmDialog.tsx`), `useToast`, `EmptyState`, `Pill`, the table and page recipes, `formatTime`, `formatDateTime`.
- **Produces:**
  - the route `/password-requests`;
  - the menu item `{ href: '/password-requests', label: 'Password requests', icon: 'key' }`;
  - the `AuditKind` value `'Password request'`.

- [ ] **Step 1: The page** (`app/(staff)/password-requests/page.tsx`)

  - `metadata.title` is `'Password requests'`. `await registrarPage()`, then `listPasswordRequests()`.
  - `pageHead`: h1 "Password requests". `pageHeadSub`: "Students who forgot their password and are asking to set a new one. Check their school ID in person, and that the code on their screen matches."
  - **No rows:** `EmptyState` with icon `key`, title "No password requests right now." and body "When a student asks from the Forgot password page, their request appears here."
  - **Rows:** `<PasswordRequestsTable rows={rows} />`.

- [ ] **Step 2: `PasswordRequestsTable`** (a client component)

  **Columns:**
  - **Student:** `name` as `tablePrimary`.
  - **Student ID:** `mono`.
  - **Code:** `formatRequestCode(code)` in `mono`, larger and semibold.
  - **Requested:** `formatDateTime(createdAt)`.
  - **State:** a `Pill`. Waiting is tone `pending`, label "Waiting". Allowed is tone `approved`, label `Allowed · until ${formatTime(approvedUntil)}`.
  - **Actions** (`actionsCell`):
    - a waiting row has a `button({ size: 'sm' })` "Decline" and a `button({ variant: 'primary', size: 'sm' })` "Allow change";
    - an allowed row has a `button({ size: 'sm' })` "Withdraw".

  **Confirmation for each action, using `ConfirmDialog`:**

  | Action | Title | Body | Confirm label | danger |
  |---|---|---|---|---|
  | Allow | `Allow ${name} to set a new password?` | `Check their school ID (${studentNumber}), and that their screen shows ${formatRequestCode(code)}.` | "Allow change" | no |
  | Decline | "Decline this request?" | `${name} (${studentNumber}) will need to ask again.` | "Decline" | yes |
  | Withdraw | "Withdraw the approval?" | `${name} won't be able to set a new password with this request.` | "Withdraw" | yes |

  **After the action:**
  - **Success:** close the dialog and show a toast:
    - Allow: "Allowed. Their screen changes within 15 seconds."
    - Decline: "Request declined."
    - Withdraw: "Approval withdrawn."
  - **Error:** close the dialog and `toast.error(res.error.message)`.

  **Keeping it fresh:** call `router.refresh()` every 15 s while the tab is visible, so new requests appear without a reload.

- [ ] **Step 3: The menu and the Audit log**

  - **`navItems`:** put the new item straight after Applications, inside the existing `if (d.isRegistrar)` block.
  - **`AUDIT_KINDS`:** add `'Password request'` before `'Admin change'`.
  - **The `CASE`:** add `WHEN x.action LIKE 'password_request.%' THEN 'Password request'`.
  - **The audit page's tone map:** add `'Password request': 'pending'`.

- [ ] **Step 4: Typecheck, lint and tests**

  Run: `npm run typecheck && npm run lint && npx vitest run`
  Expected: all exit 0.

---

### Task 6: Apply the migration and walk through it with temporary accounts

**Files:**
- Create (scratchpad only, deleted at the end): `<scratchpad>/pwreq/fixture.ts`.
  - It resolves packages from the project with `createRequire('<project>/package.json')`.
  - It connects the way `prisma/test-data.ts` does (dotenv, `PrismaNeon`, `ws`).
  - It imports the generated client by its absolute file URL.
- Create (scratchpad only, deleted at the end): `<scratchpad>/pwreq/accounts.json`. It holds the random test passwords and is never shown to the user.

**Interfaces:**
- **The fixture's commands** (`npx tsx <scratchpad>/pwreq/fixture.ts <command>`, run from the project root):
  - `create`. Makes:
    - the student "TESTER, PAULA" (`2026-99901`, `zz.pwreq.student@cgateway.edu.ph`, any program, year 1);
    - the Registrar staff member "ZZ Test Registrar" (`zz.pwreq.registrar@cgateway.edu.ph`, office `registrar`).

    Both get random 16-character passwords, saved to `accounts.json`.
  - `show`. Prints the student's `password_requests` rows (id, status, the code's first character only, expiry times) and their session count.
  - `expire <id>`. Sets `expires_at` to now minus 1 minute.
  - `close-window <id>`. Sets `approved_until` to now minus 1 minute.
  - `office <code>`. Moves the test staff member to another office.
  - `reset-limits`. Deletes the `login_attempts` rows whose `login` is `pwreq:2026-99901`, `pwreq:zz.pwreq.student@cgateway.edu.ph` or `pwreq:2026-00000`. The walkthrough makes more requests than the limits allow, so run it before each new request, except during the rate-limit check.
  - `remove`. Deletes, in this order:
    1. the `admin_actions` rows with either test user's id;
    2. the `login_attempts` rows whose `login` is one of the two emails, `2026-99901`, or `pwreq:` plus any of those or `2026-00000`;
    3. both users (cascades remove the student and staff rows, sessions and `password_requests`).

    Then it prints how many of each it removed.

- [ ] **Step 1: Ask the user before touching the live database**

  Ask for one yes covering two things: applying `0002_password_requests` to Neon, and creating, then later removing, the two fictional accounts. Stop here if the answer is no.

- [ ] **Step 2: Check the migration status, then apply**

  Run: `npx prisma migrate status`
  Expected: only `0002_password_requests` is listed as not yet applied. Anything else: stop and report to the user.

  Run: `npx prisma migrate deploy`
  Expected: "All migrations have been successfully applied."

- [ ] **Step 3: Create the accounts and open the headed browser**

  Run: `npx tsx <scratchpad>/pwreq/fixture.ts create`
  Expected: it prints both account ids.

  Then, in the Playwright window, open `http://localhost:3000/forgot-password` at 1280×800.

  The tabs share cookies, and `/forgot-password` sends anyone signed in to their portal. So before reloading or navigating the student tab, sign the staff tab out. Switching screens inside the student tab (Ask again, Cancel request) doesn't navigate, so those are fine while staff are signed in.

- [ ] **Step 4: The main path**

  1. Type `2026-99901` with a space before and after, and press Ask the Registrar. **Expected:** the waiting screen, with a code like `XXX XXX`.
  2. In a second tab, sign in as the test Registrar at `/staff-login` and open Password requests. **Expected:** within 15 s, one row for TESTER, PAULA, with the same code.
  3. Allow it and confirm. **Expected:** within 15 s, the first tab shows Set a new password.
  4. Sign the staff tab out.
  5. Save a new password (8+ characters) in the first tab. **Expected:** you land on `/` with "Your password has been reset. Sign in with your new password."
  6. Sign in as the student with the new password. **Expected:** you reach `/dashboard`.
  7. `fixture show`. **Expected:** the request is `used`.

  Then sign the student out.

- [ ] **Step 5: The Review Focus checks**

  1. **Saving after the window or a withdrawal:**
     - Make a new request and allow it. Fill in the new password in the student tab. Run `fixture close-window <id>`, then press Save straight away, before the next 15-second check, so the server's own check is what's tested. **Expected:** the closed screen, `fixture show` doesn't say `used`, and the old password still works.
     - Make another request, allow it, then Withdraw it in the staff tab. **Expected:** the student tab shows the closed screen within 15 s.
  2. **Stale expiry:** make a request and open the staff list. Run `fixture expire <id>`, then press Allow and confirm. **Expected:** the toast "This request has expired.", and `fixture show` still says `pending`.
  3. **Double decision:** make a request and open the staff list in two tabs. Confirm Allow in the first tab, then in the second. **Expected:** the second gets "This request was already decided.", and `fixture show` shows one `approved`.
  4. **Damaged storage and a malformed secret:**
     - Set `localStorage.cg_password_request = 'garbage'` and reload `/forgot-password`. **Expected:** the ask form, and no console errors.
     - POST `{"token":"abc"}` to `/api/password-requests/status`. **Expected:** `{"ok":true,"data":{"state":"closed","approvedUntil":null}}`.
  5. **Case and spaces:** ask with `ZZ.PWREQ.STUDENT@CGATEWAY.EDU.PH`. **Expected:** a row appears for TESTER, PAULA.

- [ ] **Step 6: The spec's remaining checks**

  - **Unknown ID:** ask with `2026-00000`. **Expected:** the waiting screen with a code, no row on the staff list, and the status route answers `waiting`.
  - **Two requests for one student:** make them (cancel the first in storage, or use a second tab), then allow one. **Expected:** `fixture show` lists the other as `cancelled`.
  - **Decline:** **Expected:** the student tab shows the closed screen within 15 s.
  - **Cancel request:** on the waiting screen, cancel. **Expected:** the ask form, and `fixture show` says `cancelled`.
  - **Rate limit:** ask 3 times with `2026-99901`. **Expected:** the 4th gets "Too many requests. Try again in 15 minutes."
  - **Audit log:** **Expected:** "Password request" rows by ZZ Test Registrar, and no code or password in the details.
  - **Staff portal page:** `/forgot-password?portal=staff` still shows the email form only.
  - **Non-Registrar staff:** run `fixture office library` and sign in as the test staff member. **Expected:** no Password requests in the menu, and `/password-requests` redirects to `/staff`.
  - **Console:** no console errors on any of the screens above.
  - **Phone width:** at 390×844, the forgot page, the waiting screen and the staff table all fit with no sideways scrolling.

- [ ] **Step 7: Clean up and restore**

  Run: `npx tsx <scratchpad>/pwreq/fixture.ts remove`
  Expected: it reports both users removed.

  Run `fixture show` again. **Expected:** "no such student".

  Then:
  - delete `<scratchpad>/pwreq/`;
  - sign out in the browser and clear `cg_password_request`;
  - set the dark theme, resize to 1280×800 and navigate to `/`;
  - run `npm run typecheck && npm run lint && npx vitest run` one final time. **Expected:** all exit 0.

  Report to the user what passed, anything that didn't, and that the test data is gone.
