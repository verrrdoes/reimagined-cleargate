# Password requests the Registrar approves

Date: 2026-10-25
Status: draft for review
Mockup the user approved: `2026-10-25-registrar-password-requests-mockup.html` in this folder. It's a rough layout; where it and this document differ, this document wins.

## Why this exists

A student who forgets their password today has one way back in: the Forgot password page emails a reset link. That route doesn't work for many of them:

- Email isn't set up yet (`RESEND_API_KEY` is empty), so no link is ever sent.
- Many students came in from the school's spreadsheet and have no email they can open.
- The Registrar can only issue a temporary password to students who signed up through an application. Imported students have no application, so the Registrar has no way to help them either.

This feature gives those students a way back in that rests on something the school already trusts: **the student shows up at the Registrar's office with their school ID.** The student asks on the Forgot password page. The Registrar or an admin checks them in person and allows the change. Then the student sets a new password themselves, on the device they asked from.

## Decided by the user

These came from the user (directly, or by approving the mockup of the flow):

1. The Registrar or an admin grants a student permission to change their password, after the student asks for it on the Forgot password page.
2. Approval only happens when the student comes to the office in person. Verifying by personal email is not part of this work.
3. The student identifies themselves on the Forgot password page with their **student ID or school email**.
4. After asking, the student's screen shows a **short code** (like `K7P 4QX`). The same code appears next to their name on the Registrar's list, so staff can confirm they're looking at the right request.
5. Staff decide on a new **"Password requests" page in the staff portal**, with **Allow change** and **Decline** on each request.
6. An approval works **only on the device that made the request**. Someone who typed another student's ID gains nothing from the approval.
7. After approval, the student has **about 15 minutes** to set the new password.
8. The emailed reset link stays as it is, for when email is set up.
9. This is **for students only**. Staff and admins keep the existing path: an admin issues them a temporary password from Staff accounts.

## Goals

- A student with no working email can get back into their account the same day, with one visit to the Registrar's office.
- A password changes only after a staff member has seen the student in person.
- Staff never see, type or hand out the student's password. The student chooses it.
- Every approval and decline is recorded with who did it and when.

## Non-goals

- Verifying by personal email, or by any other remote channel.
- Requests from staff or admin accounts.
- A desk-only path for a student who has no phone or computer with them. A desk-issued temporary password for imported students could be a later feature.
- Changing how the emailed reset link works.
- Notifying staff when a request arrives. The student is standing at the desk, so a bell notification adds nothing.

## Anti-goals: what would make this a failure even if it works

- A request alone, without a staff decision, changes or unlocks anything.
- An approval can be used from a device other than the one that asked.
- The page tells a stranger whether a student ID or email belongs to a real account.
- The staff screen becomes a way to look up or reveal student details beyond what the desk check needs.
- Approving a request quietly gives staff a way to set or learn the student's password.

## How it works

### The student

1. **Ask.** On the student Forgot password page (`/forgot-password`), the student enters their student ID or school email and presses **Ask the Registrar**.
2. **Waiting screen.** The page shows:
   - the code, large;
   - the ID they typed (so they can spot a typo);
   - when the request expires;
   - an instruction to bring their school ID to the Registrar's office and show this screen.

   While the request is waiting, the page checks for a decision every 15 seconds. It doesn't check while the tab is hidden, and it backs off after errors, the way the application status page does.
3. **Allowed.** The screen turns into a **Set a new password** form (new password and confirmation, 8 to 128 characters, the same rule as everywhere else). It shows how long the form stays open. Saving the form:
   - sets the password;
   - clears the "must change password" flag;
   - clears any leftover temporary password on the student's application, if they have one;
   - signs the account out on every device;
   - sends the student to the sign-in page, which already shows "Your password has been reset. Sign in with your new password." for `?reset=1`.
4. **Other endings.** Declined, withdrawn, expired, allowed but not used in time, and closed because another request was allowed all show the same screen: "This request is closed. If you still need a new password, ask again." with a button to start over. A student who is declined is standing at the desk and hears why in person. A single generic ending also means the screen can't reveal whether the ID belongs to a real account (see decision 2). If the student cancels, they go back to step 1.

   The page keeps checking while the request is allowed, so a withdrawal shows up without the student having to press Save.

### The Registrar or an admin

1. They open **Password requests** in the staff portal. It sits in the sidebar next to Applications and is visible to the same people: Registrar office staff and admins (`isRegistrar`).
2. The list shows the requests that are waiting, and those allowed but not used yet, newest first. Each row has:
   - the student's name (UPPERCASE, as stored);
   - the student ID;
   - the code;
   - when it was asked;
   - its state ("Waiting", or "Allowed, open until 10:57 AM").
3. With the student at the desk, staff check two things: the school ID matches the name and student ID in the row, and the code on the student's screen matches the row.
4. **Allow change** asks for confirmation: "Allow SANTOS, MARIA (2026-00042) to set a new password? Check their school ID, and that their screen shows K7P 4QX." Confirming starts the 15-minute window. Within about 15 seconds the student's screen turns into the password form.
5. **Decline** needs no reason. The student's screen shows the closed ending.
6. **Withdraw** appears on rows that are allowed but not used yet. It's for when staff allowed the wrong row, or realise the person isn't who they said. It asks for confirmation, closes the request at once, and the student's screen shows the closed ending.

## Decisions I made (please check these)

These weren't discussed. I've chosen what seems right; any of them can change.

1. **A request waits for 24 hours.** That's long enough to ask at night and visit the office the next morning.
2. **Nothing the student sees reveals whether an account exists.** The student sees the same waiting screen and a code whether or not the ID or email matched an active student. For no match, nothing is saved, so staff will find no row. The waiting screen shows the ID the student typed, so the student can spot a typo, and the Registrar can ask them to try again at the desk. This matches the existing Forgot password rule ("If that email has an account, a reset link is on its way").

   The status check must not give it away either, at any point, including after expiry. Unknown requests answer "waiting" until 24 hours have passed and "closed" after, exactly like real ones. Because nothing is stored for an unknown request, the device secret carries its own expiry time (for example `<expiry>.<random hex>`), so the server can answer correctly for a secret it has never seen. All endings other than success look the same (see step 4 of the student flow).
3. **One account can have several waiting requests.** All of them are listed, and staff allow the one whose code matches the student's screen. Allowing one cancels the student's other waiting requests. This way nobody can wipe out a student's real request by sending fake ones for their ID. Limits on how often requests can be sent keep the list short.
4. **The device remembers the request.** It stores its secret in the browser (localStorage), like the application status page does. The student can close the tab or reload and come back to `/forgot-password` on the same device. If browser storage is blocked, the request still works as long as the page stays open, and the screen says to keep it open.
5. **The student can cancel** a waiting request from the waiting screen.
6. **The student Forgot password page leads with the Registrar request.** Below it is "Can you open your email? Send a reset link instead", which opens the existing email form. The staff portal's Forgot password page (`?portal=staff`) stays exactly as it is.
7. **Limits on sending requests**, reusing the `login_attempts` table the way applications do (`login = "pwreq:<what they typed>"`): about 3 per typed ID and 10 per IP address in 15 minutes. The builder can tune the numbers.
8. **Audit log.** Allowing, declining and a completed change each write an `admin_actions` row (`password_request.allow`, `password_request.decline`, `password_request.used`). They appear in the Audit log like other staff actions, under their own label such as "Password request".
9. **There's no separate history page.** The Audit log is the history.
10. **Expiry is worked out when a request is read** (from its timestamps). No scheduled job is needed for this.
11. **Staff can withdraw an approval** that hasn't been used yet (Withdraw button, audit action `password_request.withdraw`). Without it, allowing the wrong row would leave a 15-minute window nobody could close.
12. **All unsuccessful endings look the same to the student**: declined, withdrawn, expired and cancelled-by-another-approval. The reason is given in person at the desk.

## Constraints

### Security

- **The device secret.** It is 32 random bytes made on the server, plus its own expiry time (decision 2), returned to the browser once. Only its sha256 hash is stored. It travels in request bodies, never in a URL, and is never logged.
- **The code is not a secret.** Its only job is to let staff match a row to a screen. Store it in plain text, 6 characters from an alphabet with no look-alikes (no `O`, `0`, `I`, `1`), shown as two groups of three.
- **Approval is not a password.** The only thing an approval unlocks is the chance for the requesting device to set a new password, within the window.
- **Setting the password happens in one transaction**, and it works once:
  - It claims the request with a conditional update (allowed, not used, window still open → used), the same way reset tokens are claimed today.
  - It checks the account is still an active student.
  - It hashes the password with bcrypt at cost 12 and updates it.
  - It sets `mustChangePassword` to false and clears `Application.tempPassword`.
  - It deletes all of the student's sessions.
- **Every staff action checks the role on the server** (`requireRegistrar`), and the page uses `registrarPage()`.
- **Two staff pressing Allow at once:** decisions use a conditional update, so the second one gets "This request was already decided."
- **Staff can only decide a request that is still waiting.** Only students' requests are accepted, and only for active accounts.
- **Never log passwords, device secrets or codes.**
- **The status-check Route Handler** calls `checkOrigin`, like `/api/applications/status`.

### The codebase

- **Next.js 16** has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next code (AGENTS.md).
- **Follow the existing patterns:**
  - server actions return `Result` through `runAction` and `fail`;
  - public polling goes through a Route Handler, like the application status page;
  - staff pages use the shared table and page recipes, as `app/(staff)/applications/page.tsx` does;
  - audit rows are written with `logAdmin`.
- **Student names are stored and shown in UPPERCASE.** Student IDs look like `2026-00042`.

### The database

- The database is the live Neon database with real data.
- The change only adds things: a new table and a new enum.
- Create the migration with `prisma migrate dev --create-only`, read the SQL, and apply it with `prisma migrate deploy`. **Never run `migrate reset` or `db:reset`.** Confirm with the user before applying.
- The project is not a git repository. Don't create one.

### Testing

- Never change a real student's password while testing, and don't act as a real staff member. Use a fictional temporary student account and a fictional temporary Registrar staff account, made for the test with the user's OK. Afterwards, remove both accounts, the test's `password_requests` rows, and the `admin_actions` rows the test wrote, so the live Audit log shows no trace of it.
- Do the walk-through in the headed Playwright browser window so the user can watch. Afterwards, put the browser back as it was: dark theme, 1280×800, on `/`.
- Don't stop the user's running dev server (port 3000).

## Shape of the data (a sketch; the builder may adjust names)

```prisma
enum PasswordRequestStatus {
  pending   // waiting for staff
  approved  // allowed; usable until approvedUntil
  declined
  used
  cancelled // by the student, or because another request for the same account was allowed
  withdrawn // staff took back an approval before it was used
}

model PasswordRequest {
  id            Int                   @id @default(autoincrement()) @map("request_id")
  userId        Int                   @map("user_id")
  code          String                @db.Char(6)
  tokenHash     String                @unique @map("token_hash") @db.Char(64)
  status        PasswordRequestStatus @default(pending)
  ipAddress     String                @map("ip_address") @db.VarChar(45)
  createdAt     DateTime              @default(now()) @map("created_at") @db.Timestamptz(3)
  expiresAt     DateTime              @map("expires_at") @db.Timestamptz(3)       // createdAt + 24 h
  decidedById   Int?                  @map("decided_by")
  decidedAt     DateTime?             @map("decided_at") @db.Timestamptz(3)
  approvedUntil DateTime?             @map("approved_until") @db.Timestamptz(3)  // decidedAt + 15 min
  usedAt        DateTime?             @map("used_at") @db.Timestamptz(3)
  // relations to User for userId (cascade) and decidedById (set null)

  @@index([status, createdAt])
  @@index([userId])
  @@map("password_requests")
}
```

A request counts as **expired** in two cases: it is waiting and `expiresAt` has passed, or it was allowed and `approvedUntil` has passed. No column stores this.

## What the server offers (a sketch)

- **Ask:** a public server action. Input: student ID or school email. Output: `{ code, token, expiresAt }`, and the same shape when nothing matched. Rate-limited.
- **Check status:** a public Route Handler. Input: `{ token }`. Output: `{ status: 'waiting' | 'allowed' | 'closed', approvedUntil? }`. An unknown token answers "waiting" until the expiry it carries passes, then "closed", so the check can't reveal whether an account exists.
- **Set password:** a public server action. Input: `{ token, password }`. Claims the request as described under Security and redirects to `/?reset=1`.
- **Cancel:** a public server action. Input: `{ token }`.
- **Allow, Decline and Withdraw:** staff server actions. Input: `{ id }`. Registrar staff and admins only.

## Left to the builder

- File, function and component names; how the student flow is split into components.
- Final wording of the copy (keep the meaning above).
- The exact rate-limit numbers.
- Whether the sidebar item shows a count of waiting requests, and which icon it uses.
- Whether old rows are cleaned up (for example, rows past 30 days, on the existing cron tick).
- How many automated tests to write. The repo has vitest and Playwright installed but no tests yet. Small pure helpers, such as code generation and working out the state, are the natural first ones.
