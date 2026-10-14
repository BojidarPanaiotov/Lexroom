# Lexroom Contract Review

A shared workspace where three lawyers request simulated AI reviews of the firm’s contracts, watch them run, and read the findings. There is one workspace and no login. The lawyer selector only records who is asking.

The lawyers and the findings come from `samples/lawyers.json` and `samples/documents.json`. The app does not invent replacement people or issues.

## Prerequisites

- Node.js 20 or newer
- npm
- PostgreSQL, or the embedded Postgres server included for local use

Copy the environment file from the `lexroom` directory:

```powershell
Copy-Item .env.example .env
```

`DATABASE_URL` points at `postgresql://lexroom:lexroom@localhost:5432/lexroom`.

## Database

### Embedded Postgres

`npm run db` starts a persistent Postgres 18 cluster. Leave that process running.

The data directory is outside this project so database writes do not restart the Next.js dev server. The default path is `%LOCALAPPDATA%\lexroom\pgdata` on Windows, or `~/.lexroom/lexroom/pgdata` otherwise. Override it with `PGDATA`. Port, user, password, and database name can be overridden with `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE`.

If `npm install` skipped dependency install scripts and `npm run db` cannot find the Postgres binaries, hydrate them from the package directory and start again:

```powershell
Push-Location node_modules/@embedded-postgres/windows-x64
node scripts/hydrate-symlinks.js
Pop-Location
```

### Your own Postgres

Create a database and set `DATABASE_URL` in `.env`. You can skip `npm run db`.

### Migrate and seed

From the `lexroom` directory, with Postgres already accepting connections:

```powershell
npm run db:deploy
npm run db:seed
```

`db:deploy` runs `prisma migrate deploy`. The migration adds a check constraint and two triggers that Prisma’s schema language cannot express. Use `migrate deploy` for this project. A later `prisma migrate dev` may propose dropping those objects; do not apply that change.

The seed upserts the three lawyers and thirteen documents from the sample files. It leaves existing reviews in place.

## Run the app

Use three terminals, all in `lexroom`:

```powershell
npm run db       # only when using the embedded server
npm run dev      # http://localhost:3000
npm run worker   # applies the simulated review on its own schedule
```

The page polls every 1.5 seconds. The worker polls every 500 milliseconds (`WORKER_INTERVAL_MS`). A review created while the worker is stopped stays on **Starting** until the deadline. Read endpoints still fail it once 60 seconds have passed since `requestedAt`. Findings are saved only while the worker is running.

## Checks

```powershell
npm test         # simulation schedule and Europe/Rome month boundaries
npm run verify   # quota, one-active-review, timeout, retry, and findings against the live database
npm run lint
```

`npm run verify` deletes reviews at the start and at the end. Lawyers and documents stay seeded.

## Product decisions

### 1. Previous review while a new review runs

The last successful review stays on the document page, under **Previous completed review**, for as long as a newer attempt is running or has failed. The newer attempt is a separate card, **Current review** or **Latest attempt**, with its own id, requester, and timestamps. When the newest review itself completes, that result is the completed review on screen. Older successes remain in the history list.

A lawyer who asks for a fresh look still needs the last finished analysis, and the two results have to stay easy to tell apart.

### 2. Findings before completion

Findings are stored as they arrive. Until the review completes they are shown under **Partial results — not final**. **Final results** is used only after a successful completion. A failed review keeps the findings it already saved and labels them **Incomplete — not a completed analysis**, together with the error. A completed review with an empty findings list says **No issues found.**

Partial output is useful while the review is running. It is a finished opinion only after the review completes.

### 3. Requests beyond the plan

The shared workspace allows 10 successful reviews per calendar month. When completed reviews and reviews still in progress already add up to 10, `POST /api/documents/[id]/reviews` responds with **429** at once. The body includes the usage and the reset time, and it says the request was rejected and was not queued. The header shows `N / 10 reviews used` (completed reviews only) and, while a review is open, how many places are being held. The request button stays available when the quota is full so the server error is visible on the page.

The limit is a cap for this month. Holding the request for next month would look like a review that had been accepted.

## Calendar month and quota

Months use **Europe/Rome** (CET/CEST). A review belongs to the month of its persisted `requestedAt`, which is also the timestamp the deadline is measured from. The usage reset is 00:00 Rome time on the first day of the next month. In October 2026 that instant is 1 Nov 2026, 00:00 CET (`2026-10-31T23:00:00.000Z`).

Failed reviews do not count, and they release the place they were holding. In-progress reviews hold a place so concurrent requests cannot create more than 10 reviews that might all succeed. The check runs inside a transaction that takes `pg_advisory_xact_lock(872341, 1)`.

## One review per document

A document has at most one pending or running review. `Review.activeDocumentId` is the document id while the review is open and null after it finishes. The column is unique, and a check constraint ties it to the status. A second request gets **409** and names the lawyer who already started the review. A retry inserts a new review row after the previous one has finished.

## Deadline

A review that is still pending or running 60 seconds after `requestedAt` becomes permanently `failed`. The comparison uses the database clock (`clock_timestamp()`), and `failedAt` for a timeout is `requestedAt` plus 60 seconds. Completion and new findings are written only when the row is still open and the deadline is still ahead. Triggers reject a status change after `completed` or `failed`, and they reject findings on a closed review. A late result from the simulated reviewer cannot turn a failed review into a completed one, and a failed review never consumes the monthly plan.

`REVIEW_TIMEOUT_MS` changes the deadline for tests. The default is 60000.

## Simulated reviewer

There is no model call. Each document’s findings are the `findings` array in `samples/documents.json`, including clause, title, severity, excerpt, and explanation. The schedule is stored on the review, so a restarted worker continues from the elapsed time.

Outcomes are exclusive:

- About 1 in 10 are slow and attempt to finish 60–120 seconds after the request. The deadline fails them first, and anything scheduled after 60 seconds is ignored.
- About 1 in 5 fail inside the normal 5–30 second window, after a random number of findings (including none, or all of them).
- The rest succeed in about 5–30 seconds, with findings spread out before completion.

To exercise a path without waiting, send `simulation` on the start request. The page does not send this.

```json
{
  "lawyerId": "7c1f3d2a-9b64-4e0f-8a21-5d3e6f7a8b90",
  "simulation": { "outcome": "failure", "durationMs": 0, "failAfterFindings": 1 }
}
```

`outcome` is `success`, `failure`, or `slow`. `durationMs` is an integer from 0 to 300000. Rates and windows can also be set with `REVIEW_FAIL_RATE`, `REVIEW_SLOW_RATE`, `REVIEW_DURATION_MIN_MS`, `REVIEW_DURATION_MAX_MS`, `REVIEW_SLOW_MIN_MS`, and `REVIEW_SLOW_MAX_MS`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/lawyers` | Lawyers for the selector |
| `GET` | `/api/documents` | Documents and the latest review |
| `GET` | `/api/documents/[id]` | Document, history, and findings |
| `POST` | `/api/documents/[id]/reviews` | Start a review and return its id |
| `GET` | `/api/reviews/[id]` | Status, timestamps, findings, error |
| `GET` | `/api/usage` | Completed count, limit, in-progress count, reset time |

Error codes: `VALIDATION` and `UNKNOWN_LAWYER` (400), `NOT_FOUND` (404), `REVIEW_IN_PROGRESS` (409), `QUOTA_EXCEEDED` (429), `INTERNAL` (500).

## Assumptions and limitations

- The workspace is implicit. There is no workspace table and no authentication.
- The selector is stored in this browser (`lexroom-lawyer-id`). Every browser sees the same reviews.
- Uploads, document parsing, billing, and a real model are out of scope.
- The worker is a separate process. It is not started by the web server.
- `npm run verify` is the concurrency check. There is no browser test suite.

## Time spent

About 40 minutes on 14 October 2026, from 11:09 to 11:46 local time.
