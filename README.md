# Nordia — Leave requests

Internal tool for Nordia (fictional company) replacing time-off management by e-mail.
Employees submit leave requests, managers approve or reject them, everyone sees balances and history, and a team calendar shows who is away.

**Stack:** Next.js (App Router) + React + TypeScript, REST API in Next route handlers, PostgreSQL + Drizzle ORM, Zod validation, Vitest + Supertest + React Testing Library.

## Run it

Prerequisites: Node.js 22.12+, npm, PostgreSQL.

```bash
# 1. PostgreSQL (skip if you already have one)
docker run -d --name nordia-db -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=app_db postgres:16

# 2. Install and configure
npm install
cp .env.example .env          # Windows: copy .env.example .env

# 3. Create tables and load the supplied data
npx drizzle-kit push
npx tsx scripts/seed.ts       # 12 employees, 3 teams, 5 existing leaves

# 4. Start
npm run dev                   # http://localhost:3000
```

Supplied data (`data/`):
- `employees.json`: 12 employees in 3 teams (Platform, Product, Support). Override the path with `EMPLOYEES_DATASET_PATH`.
- `leaves-existing.json`: 5 already-approved leaves (Jan to Mar 2027), validated with the same rules as live requests. Override with `LEAVES_DATASET_PATH`.

## Test it

```bash
npm test             # all tests (87)
npm run lint
npm run typecheck
npm run build
```

API tests run against a **real PostgreSQL database** (same `DATABASE_URL`). Use a local or test database, not data you care about.

| File | Covers |
|---|---|
| `tests/leave-rules.test.ts` | working days, balance, overlap, 40 % warning (pure functions) |
| `tests/existing-leaves.test.ts` | supplied leaves validated with the same rules |
| `tests/api.test.ts` | REST API with real DB: create, approve, reject, permissions, concurrent creates cannot overspend |
| `tests/directory.test.ts` | directory parsing and validation |
| `tests/identification.test.tsx`, `tests/components.test.tsx` | UI: role/profile selection, balance, history rendering |

Optional browser smoke test: `npx playwright install chromium`, start the app, then `npx tsx scripts/browser-smoke.ts`.

## How to try it

1. Open http://localhost:3000, choose **Employee Portal**, pick e.g. *Bilel Khemiri (2)*, and submit a request.
2. Log out, choose **Manager Portal**, pick *Amel Ben Youssef (1)*: the request is in the pending queue. Approve it or reject it (a comment is required to reject).
3. Switch back to the employee: balance and history are updated. The **Calendar** view shows approved absences of the team (the supplied data is in 2027, go to Jan 2027).
4. Flagged request: as a Support employee, ask for 13 Jan 2027. Two of four people are already away (50 % > 40 %), so the request is created and flagged to the manager.

## Business rules

- 25 working days per year, Monday to Friday only. No public-holiday calendar, no carry-over.
- A request exceeding the available balance is rejected at creation (HTTP 422). Pending requests reserve days.
- Two non-rejected requests of the same employee cannot overlap (HTTP 409).
- If more than 40 % of the team is already away on a requested day, the request is **flagged** to the manager, never rejected.
- Rejection requires a comment, approval comment is optional. Only pending requests can be reviewed.
- Requests spanning two years are checked against each year's balance. Backdated requests are allowed (the brief does not forbid them).

## Calculation formulas

Implemented in `src/lib/leave-rules.ts`.

```text
working days of a request = number of days from startDate to endDate (both included)
                            that are Monday to Friday

used        = working days of APPROVED requests, in the given year
pending     = working days of PENDING requests, in the given year
remaining   = 25 - used
available   = 25 - used - pending

A new request is accepted only if, for each calendar year it touches:
            requested working days <= available
```

REJECTED requests are ignored.

**Example.** An employee has 5 approved days and 3 pending days in 2027:
`remaining = 25 - 5 = 20`, `available = 25 - 5 - 3 = 17`.
Mon 18 Jan to Fri 22 Jan 2027 = 5 working days, 5 <= 17, so it is accepted.
Fri 22 to Mon 25 Jan = 2 working days, the weekend does not count.

**Team warning (40 %).** For each working day of the request:

```text
away  = distinct teammates with APPROVED leave on that day (requester excluded)
ratio = away / team size                      (team size includes the manager)
flag the request if ratio > 0.40 on at least one day
```

Example: Support has 4 people, 2 are away on 13 Jan 2027, so `2 / 4 = 50 % > 40 %`: flagged, not rejected.

## Role switch and permissions

No real authentication, as required. You choose **Employee Portal** or **Manager Portal**, then a profile. The choice is stored in an HttpOnly cookie (or an `x-user-id` header for API calls). This identifies, it does not authenticate: anyone can pick anyone.

- Employees see only their own balance and history.
- A manager sees the requests of their **direct reports** (`managerId`). The assignment is checked again inside the transaction at review time: being in the same team is not enough.
- The team calendar shows names and approved dates only, never reasons or comments.
- When a request is created, the server re-reads the employee's manager and team (it never trusts the client), then stores them on the request.

## Choices and assumptions

- **One Next.js app for API and UI**: one deploy, shared types, less setup. Business rules are pure functions (`leave-rules.ts`), separate from HTTP and database code, so they are easy to test.
- **PostgreSQL**: real transactions and row locks. Creating a request locks the employee row, so two simultaneous requests cannot spend the same allowance.
- **Manager scope**: direct reports, not the whole team.
- **Dates**: calendar dates (`YYYY-MM-DD`), computed in UTC.

## REST API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/employees` | Active directory (optional `role`, `search`) |
| POST / GET / DELETE | `/api/identity` | Choose, read, clear the current profile |
| GET | `/api/employees/:id` | Own details or assigned report |
| GET | `/api/employees/:id/balance?year=2026` | Annual balance |
| GET | `/api/employees/:id/leave-requests` | History |
| POST | `/api/leave-requests` | Create a request (dates, optional reason) |
| GET | `/api/manager/leave-requests/pending` | Manager's pending queue and counters |
| GET | `/api/manager/leave-requests` | Manager's review history |
| PATCH | `/api/leave-requests/:id/approve` | Approve (optional comment) |
| PATCH | `/api/leave-requests/:id/reject` | Reject (comment required) |
| GET | `/api/team/availability` | Team calendar data |
| GET | `/api/directory`, POST `/api/directory/import` | Directory status and import |
| GET | `/api/health` | Database check |

Responses are `{ data: ... }`. Errors are `{ error: { message, code, fields? } }` with distinct HTTP codes (400 invalid input, 403 forbidden, 404 not found, 409 overlap or already reviewed, 422 insufficient balance).

## What I cut

- Authentication beyond the role switch.
- Cancelling or editing a request, half days, public holidays, carry-over.
- Notifications (the manager's view refreshes every 15 s and on focus).
- Pagination (not needed for 12 people).
- Full browser end-to-end tests (only a smoke script).

## Known limitations

- The directory import endpoint is public (no auth in this case study). It must be admin-only in production.
- The 40 % warning is advisory and computed at request time. Two simultaneous requests from different people are not blocked.
- Dates are computed in UTC, no per-user time zone.

## Use of AI

I used **ChatGPT** and **Claude** (Anthropic) during this project.

- **What I did myself:** I designed and wrote the solution (architecture, business rules, API, UI, tests).
- **Where AI helped:** reviewing and correcting my work (bugs, edge cases, code quality), and improving the wording of this README and the design note.
- **How I checked it:** I read every suggested correction before keeping it, ran `npm run lint`, `npm run typecheck`, the 87 tests and `npm run build`, and tried the main flows by hand in the browser.
- **Ownership:** I can explain every choice in this repository.

## Project layout

```text
src/app/api/     REST route handlers
src/app/         pages (welcome, identify, dashboard)
src/components/  React UI
src/lib/         business rules (leave-rules), services, validation, types
src/db/          schema, directory and leaves loading
data/            supplied dataset (employees, existing leaves)
tests/           unit, API (real PostgreSQL) and UI tests
scripts/         seed and browser smoke test
```