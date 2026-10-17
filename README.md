# Lexroom Contract Review

A shared workspace where three lawyers request simulated AI reviews of the firm’s contracts. There is one workspace and no login. The app lives in [`lexroom`](lexroom).

Open http://localhost:3000. Three lawyers share a limit of 10 successful reviews per calendar month in Europe/Rome. Findings come from `lexroom/samples/documents.json`.

## Setup

From `lexroom`:

```powershell
npm install
```

Requires Node.js 20 or newer. `DATABASE_URL` points at `postgresql://lexroom:lexroom@localhost:5432/lexroom`. Database files, migrations, and the seed are described in [`lexroom/README.md`](lexroom/README.md).

Apply the schema and seed once, after Postgres is accepting connections:

```powershell
npm run db:deploy
npm run db:seed
```

## Run the application

```powershell
npm run app
```

`npm run app` starts the embedded Postgres server, the Next.js dev server, and the review worker in one process group. Leave it running and open http://localhost:3000.

The first time, wait until that command reports that Postgres is accepting connections, then run `npm run db:deploy` and `npm run db:seed` in a second terminal. Later sessions only need `npm run app`.

The page polls every 1.5 seconds. The worker polls every 500 milliseconds. If Postgres is already running elsewhere, set `DATABASE_URL` and start `npm run dev` and `npm run worker` yourself. `npm run app` always starts the embedded server as well.

## Decisions

### 1. Previous review while a new review runs

The last successful review stays on the document page, under **Previous completed review**, while a newer attempt is running or has failed. The newer attempt is a separate card, with its own id, requester, and timestamps. When the newest review completes, that result is the one on screen. Older successes stay in the history list.

A lawyer who asks for a fresh look still needs the last finished analysis, and the two results have to stay easy to tell apart.

### 2. Findings before completion

Findings are stored as they arrive. Until the review completes they are shown under **Partial results — not final**. **Final results** is used only after a successful completion. A failed review keeps the findings it already saved and labels them **Incomplete — not a completed analysis**. A completed review with no findings says **No issues found.**

Partial output is useful while the review is running. It is a finished opinion only after the review completes.

### 3. Requests beyond the plan

The shared workspace allows 10 successful reviews per calendar month. When completed reviews and reviews still in progress already add up to 10, the start request responds with **429** at once. The body includes the usage and the reset time, and it says the request was rejected and was not queued. The request button stays available when the quota is full so the server error is visible on the page.

The limit is a cap for this month. Holding the request for next month would look like a review that had been accepted.

## Assumptions

- The workspace is implicit. There is no workspace table and no authentication.
- The selected lawyer is stored in this browser (`lexroom-lawyer-id`). Every browser sees the same reviews.
- Months use Europe/Rome. A review belongs to the month of its persisted `requestedAt`.
- The reviewer is simulated from the sample findings. There is no model call.

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

## Limitations

- Uploads, document parsing, billing, and a real model are out of scope.
- The worker is a separate process. The web server does not start it. `npm run app` only runs the two side by side.

## Time spent

2h	Building the core solution with AI assistance
1h	Reviewing the code, then refactoring and simplifying it
1h	Debugging, testing edge cases, and checking stability
