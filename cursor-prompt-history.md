# Lexroom contract review app
_Exported on 10/14/2026 at 13:49:39 GMT+3 from Cursor (3.24.18)_

---

**User**

# Build Lexroom Contract Review — Technical Exercise

## Goal

Build a small, working web application for a law firm's shared workspace where three lawyers can request AI contract reviews, monitor progress, and read the findings.

Use:
- Next.js with App Router
- React and TypeScript
- PostgreSQL
- Prisma ORM
- Tailwind CSS for basic styling

## Input Data

Read and inspect these files before implementation:
- `samples/documents.json` — workspace documents and the findings returned by the simulated AI.
- `samples/lawyers.json` — the three lawyers.

Use these files as the source of truth. Seed the database from them where appropriate. Do not invent replacement document findings or lawyers.

## Functional Requirements

### 1. Workspace and documents
- There is one shared workspace containing all documents and three lawyers.
- There is no authentication.
- Provide a UI control to select which lawyer is currently using the app.
- Display all workspace documents.
- For each document, display the status of its latest review.
- Show who requested a review and when.
- Allow a lawyer to open a document and inspect its review history and results.

### 2. Starting and monitoring reviews
- A lawyer can request an AI review of a document.
- Create a persistent review record and return its ID immediately.
- Run the simulated AI independently of the HTTP request.
- Update the UI while the review is running, using polling every 1–2 seconds.
- Display the current status, elapsed time if useful, and any returned findings.
- Support successful completion, failure, and retry.
- Every retry must create a new review record; never overwrite the previous attempt.
- All three lawyers must see consistent workspace-wide review states.

### 3. Simulated AI behavior
The AI is fake. Do not integrate a real AI model.

Use the findings specified for each document in `samples/documents.json`.

Simulate the following behavior:
- Return findings one at a time, with a total normal execution time of approximately 5–30 seconds.
- Approximately 1 in 5 reviews fail, potentially after returning some findings or none.
- Approximately 1 in 10 reviews are slow and attempt to finish after 60–120 seconds.
- Any review still in progress 60 seconds after its request was created must become permanently `failed`.
- Findings or completion arriving after the deadline must be ignored.
- A failed review must never become completed later or consume the monthly plan.
- Use injectable timing/randomness or deterministic simulation controls so behavior can be verified without long waits.

### 4. Results and findings
- Each finding must include its clause or finding text, severity, and explanation, based on the supplied sample data.
- Persist findings as they arrive.
- Clearly distinguish partial findings from final results.
- A completed review is the only state that makes findings final.
- Failed reviews may retain partial findings for transparency, but the UI must explicitly mark them as incomplete and never present them as a completed analysis.
- Keep the previous successful review available while a new review runs, without confusing the old result with the new one.

## Business Rules

### Monthly plan
- The shared workspace has a limit of 10 successful reviews per calendar month.
- The limit is shared by all three lawyers, not per user.
- Failed reviews do not count.
- Count only successfully completed reviews toward the monthly usage.
- Enforce the limit on the backend, not only in the UI.
- Protect against concurrent requests oversubscribing the plan. Use appropriate database transactions, locking, or another sound concurrency-control strategy.
- When the limit is reached, reject new requests immediately with a clear error and explain when the quota resets. Do not queue them for a future month.
- Define calendar-month boundaries consistently using a documented timezone.

### Concurrent reviews
- A document can have at most one active review at a time, regardless of which lawyer requested it.
- Enforce this rule on the backend and, where practical, at the database level.
- If another lawyer attempts to start a review for a document that already has an active review, reject the request with a useful message.

### Timeout and state integrity
- Enforce the 60-second deadline on the backend.
- The authoritative deadline is based on the persisted request timestamp, not the time a worker happens to wake up.
- Prevent stale workers from updating reviews after they have timed out.
- Make state transitions safe under concurrent updates.
- A review that has become `failed` must remain failed even if the simulated AI later returns findings or a completion signal.

Implement and document these decisions in the README:

1. **Previous review while a new review runs:** Keep the previous successful result visible, but clearly label it as a previous review and distinguish it from the current attempt.

2. **Findings before completion:** Show findings as they arrive in a clearly labeled "Partial results — not final" section. Only display them as final after the review completes successfully. If it fails, mark them as incomplete.

3. **Requests beyond the plan:** Reject the request immediately when the quota is exhausted. Do not silently queue it or imply that a review will start later. Show the usage and reset date.

## Suggested Data Model

Use Prisma models for:
- `Lawyer`
- `Document`
- `Review`
- `Finding`

A review should store at least:
- ID and document relationship
- Requesting lawyer
- Status
- Request timestamp
- Completion/failure timestamp as appropriate
- Error message if failed

A finding should store at least:
- ID and review relationship
- Clause or finding text
- Severity
- Explanation
- Creation timestamp or sequence order

Preserve review history. Do not overwrite prior reviews or findings when retrying.

## API

Implement a minimal API, for example:
- `GET /api/documents` — documents and latest review status
- `POST /api/documents/[id]/reviews` — start a review
- `GET /api/reviews/[id]` — status, timestamps, findings, and error
- `GET /api/usage` — successful reviews used this month, limit, and reset date
- Optional: `GET /api/lawyers` — list lawyers for the selector

Validate request bodies and return meaningful HTTP status codes and error messages.

## UI

Build a simple, polished, functional interface with:
- Lawyer selector
- Workspace document list
- Latest review status for each document
- Review history and previous successful results
- Start/retry review actions
- Live status updates and partial findings
- Clear loading, error, timeout, and quota-exhausted states
- Severity labels for findings
- Monthly usage indicator, e.g. `6 / 10 reviews used`

Do not spend time on elaborate animations or unnecessary design features.

## README and Delivery

Create a README containing:
- Prerequisites and environment setup
- Database setup and migration commands
- Seed instructions
- Commands to run the web app and worker
- The three product decisions and their reasoning
- Assumptions, limitations, and unfinished work
- The actual time spent on the exercise

Do not implement file uploads, document parsing, authentication, billing, or real AI integration. These are explicitly out of scope.

Focus on business-rule correctness, concurrency safety, clear user-facing states, readable code, and explicit product judgment.

---

**Cursor**

I'll start by reading the sample data and the current project layout so the app is built from those files, not invented replacements.

The sample files are the source of truth: three lawyers and thirteen documents, including one with no findings. Next I’ll set up Postgres and Prisma, then build the review rules around that data.

The database layer is next: reviews have to keep their history, enforce the monthly limit, and ignore anything that arrives after the deadline.

The page never finishes loading because Postgres is writing inside the Next.js project, and that keeps restarting the dev server. I’ll move the database files out of the project and fix the lawyer selector.

Lexroom is a shared contract-review workspace at http://localhost:3000. Three lawyers share one list of documents, a simulated reviewer, and a limit of 10 successful reviews per calendar month.

The app, the worker, and Postgres are running. The database is seeded with the three lawyers and thirteen documents from the sample files, and review history from this session has been cleared, so the workspace starts at **0 / 10**.

Choose a lawyer in the header, open a document, and request a review. The page polls every 1.5 seconds. Findings show up under **Partial results — not final** until the review completes. A successful review is the only one labeled **Final results**. A failure or a 60-second timeout keeps any findings already saved and marks them **Incomplete — not a completed analysis**. While a newer attempt is running or has failed, the last successful review stays on the page as **Previous completed review**. A retry always creates a new review.

The monthly cap is enforced in the database. In-progress reviews hold a place, failed reviews release it, and a request past the limit is rejected immediately with the usage and the reset time (1 Nov 2026, 00:00, Europe/Rome). A document can have only one review in progress.

Setup, the worker, simulation controls, and the reasoning for those three decisions are in `lexroom/README.md`.

---

**User**

<timestamp>Wednesday, Oct 14, 2026, 11:46 AM (UTC+3)</timestamp>
<system_notification>
The following task has finished. If you were already aware, ignore this notification and do not restate prior responses.

<task>
kind: shell
status: success
task_id: 802283
title: Install Prisma, tsx, and embedded Postgres
tool_call_id: call-348d2ce5-5998-4e7c-83ea-cb4a73ae9721-40
fc_212c737f-9254-9761-8b58-314dd7cc2b83_0
output_path: C:\Users\bozhi\.cursor\projects\c-Users-bozhi-Desktop-Projects-Lexroom-Lexroom\terminals\802283.txt
</task>
</system_notification>

<timestamp>Wednesday, Oct 14, 2026, 11:46 AM (UTC+3)</timestamp>
<system_notification>
The following task has finished. If you were already aware, ignore this notification and do not restate prior responses.

<task>
kind: shell
status: error
task_id: 802285
title: Lint application, library, and script files
tool_call_id: call-cae10498-bb0b-4c33-833b-fcb26739693f-132
fc_bb7f8728-3d5c-95d8-b489-24592241632f_1
detail: exit_code=1
output_path: C:\Users\bozhi\.cursor\projects\c-Users-bozhi-Desktop-Projects-Lexroom-Lexroom\terminals\802285.txt
</task>
</system_notification>

<timestamp>Wednesday, Oct 14, 2026, 11:46 AM (UTC+3)</timestamp>
<system_notification>
The following task has finished. If you were already aware, ignore this notification and do not restate prior responses.

<task>
kind: shell
status: error
task_id: 802284
title: Start embedded Postgres and create the database
tool_call_id: call-e6138d74-2e31-4d86-9272-3c52037536f8-116
fc_e1a69481-2e7e-92ac-807f-f7b19f3cd9a1_0
detail: exit_code=4294967295
output_path: C:\Users\bozhi\.cursor\projects\c-Users-bozhi-Desktop-Projects-Lexroom-Lexroom\terminals\802284.txt
</task>
</system_notification>

<timestamp>Wednesday, Oct 14, 2026, 11:46 AM (UTC+3)</timestamp>
<system_notification>
The following task has finished. If you were already aware, ignore this notification and do not restate prior responses.

<task>
kind: shell
status: error
task_id: 802286
title: Start the Next.js development server
tool_call_id: call-347411fc-9e47-437f-a15a-c1ca57d6f0f3-133
fc_bfcb008c-7765-989b-b07f-a080b8d3b62c_0
detail: exit_code=4294967295
output_path: C:\Users\bozhi\.cursor\projects\c-Users-bozhi-Desktop-Projects-Lexroom-Lexroom\terminals\802286.txt
</task>
</system_notification>

<timestamp>Wednesday, Oct 14, 2026, 11:46 AM (UTC+3)</timestamp>
<system_notification>
The following task has finished. If you were already aware, ignore this notification and do not restate prior responses.

<task>
kind: shell
status: error
task_id: 802287
title: Start the review worker process
tool_call_id: call-347411fc-9e47-437f-a15a-c1ca57d6f0f3-134
fc_bfcb008c-7765-989b-b07f-a080b8d3b62c_1
detail: exit_code=4294967295
output_path: C:\Users\bozhi\.cursor\projects\c-Users-bozhi-Desktop-Projects-Lexroom-Lexroom\terminals\802287.txt
</task>
</system_notification>
<user_query>Briefly inform the user about the task result and perform any follow-up actions (if needed). If there's no follow-ups needed, don't explicitly say that.</user_query>

---

**Cursor**

Those background jobs just reported in. I’ll check whether they were old processes that were already replaced, or whether Postgres, the app, or the worker actually stopped.

Those notices are from earlier process restarts, not from the app that is running now.

Prisma installed successfully. The first lint run failed on the lawyer selector, which was rewritten afterward, and a later lint run completed with no errors. The original Postgres, Next.js, and worker processes were stopped when they were replaced. The current database, dev server, and review worker are still running at http://localhost:3000.

---

**User**

<timestamp>Wednesday, Oct 14, 2026, 12:23 PM (UTC+3)</timestamp>
<system_notification>
The following task has finished. If you were already aware, ignore this notification and do not restate prior responses.

<task>
kind: shell
status: aborted
task_id: 802290
title: Restart the review worker
tool_call_id: call-1da00960-8455-45e1-a4bf-c9bbafd930ab-175
fc_231b4cef-b496-96f2-bfb1-81f416e18504_1
detail: terminated_by_user
output_path: C:\Users\bozhi\.cursor\projects\c-Users-bozhi-Desktop-Projects-Lexroom-Lexroom\terminals\802290.txt
</task>
</system_notification>
<user_query>Briefly inform the user about the task result and perform any follow-up actions (if needed). If there's no follow-ups needed, don't explicitly say that.</user_query>

---

**Cursor**

The review worker was stopped. I’ll confirm it is no longer running.

The review worker has stopped, so new reviews will stay on **Starting** until you start it again with `npm run worker` in the `lexroom` directory. The site and database are unaffected, and any review still open after 60 seconds will be marked failed when the page next loads.

---

**User**

<timestamp>Wednesday, Oct 14, 2026, 12:23 PM (UTC+3)</timestamp>
<system_notification>
The following task has finished. If you were already aware, ignore this notification and do not restate prior responses.

<task>
kind: shell
status: aborted
task_id: 802289
title: Restart Next.js after moving the database
tool_call_id: call-1da00960-8455-45e1-a4bf-c9bbafd930ab-174
fc_231b4cef-b496-96f2-bfb1-81f416e18504_0
detail: terminated_by_user
output_path: C:\Users\bozhi\.cursor\projects\c-Users-bozhi-Desktop-Projects-Lexroom-Lexroom\terminals\802289.txt
</task>
</system_notification>

<timestamp>Wednesday, Oct 14, 2026, 12:23 PM (UTC+3)</timestamp>
<system_notification>
The following task has finished. If you were already aware, ignore this notification and do not restate prior responses.

<task>
kind: shell
status: aborted
task_id: 802288
title: Start Postgres from the relocated data directory
tool_call_id: call-a95db397-8aa0-4fd0-b6cf-998095c1ee81-169
fc_ccc11778-cccf-975c-99de-e8bb77cf5948_0
detail: terminated_by_user
output_path: C:\Users\bozhi\.cursor\projects\c-Users-bozhi-Desktop-Projects-Lexroom-Lexroom\terminals\802288.txt
</task>
</system_notification>
<user_query>Briefly inform the user about the task result and perform any follow-up actions (if needed). If there's no follow-ups needed, don't explicitly say that.</user_query>

---

**Cursor**

The dev server and database were stopped as well. I’ll confirm both processes are gone.

The Next.js dev server and the embedded Postgres process have both stopped. The database port is closed, so the app will not load documents or reviews until you start Postgres again with `npm run db` in the `lexroom` directory, then `npm run dev` and `npm run worker`.

---

**User**

@c:\Users\bozhi\.cursor\projects\c-Users-bozhi-Desktop-Projects-Lexroom-Lexroom\terminals\4.txt:374-377 There is a relation error in the DB 42P01 for the Review table

---

**Cursor**

The database is rejecting queries because the `Review` table is missing. I’ll check the terminal output and whether the migrations were applied to the database you’re connected to.

The `lexroom` database was empty, so Postgres returned `42P01` because the `Review` table had never been created in this cluster.

The initial migration is applied and the sample data is loaded again: 3 lawyers and 13 documents. `Review` is present, along with `Lawyer`, `Document`, and `Finding`. The worker can keep running; those error lines are from before the tables existed, and a quiet tick means it found nothing to update.

---

**User**

Expose a button in the header which will reset the current reviews back to 0

---

**Cursor**

The header needs a control that clears every review so usage returns to 0. I’ll look at how reviews are stored and how the header is built, then add that action.

The usage counter only returns to 0 if the review rows themselves are removed. I’ll add a header button that deletes them on the server and refreshes the workspace.

The header now has a **Reset reviews** button. It asks for confirmation, then deletes every review and its findings. Lawyers and documents stay. The usage counter returns to **0 / 10**, and the document list updates immediately.

I used the button once to check it, so the workspace is currently at 0 reviews.

