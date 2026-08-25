# Deployment architecture

This project deploys as **7 processes from one build**, all started from the
repo root via the root `package.json` scripts. There is no platform-specific
config file (no `render.yaml`) — any host that can run "one web process +
six background/worker processes from the same repo" works: Render, Railway,
Fly.io, a VM with a process manager, Docker Compose, Kubernetes, etc. Map the
services below onto whatever your platform calls "web service" vs.
"background worker".

## 1 public service — the web service

Runs Next.js (frontend) and Express (API) in the **same process group**,
started together by `concurrently`. This is the only process that should get
a public URL / public port.

- Build: `npm run build`
- Start: `npm run start:web` (or `npm start`, which is an alias for it)
- Public URL: `https://yourdomain.com`
  - Frontend: `https://yourdomain.com/`
  - API: `https://yourdomain.com/api/v1/*`
  - Health check: `https://yourdomain.com/api/health`
- Internally: Express binds to `localhost:4000` (not exposed publicly).
  Next.js binds to the platform's `$PORT` and its rewrite in
  `frontend/next.config.mjs` proxies `/api/*` server-side to
  `http://localhost:4000/api/*` (configurable via `BACKEND_INTERNAL_URL`).
  The browser only ever talks to the one public origin.
- `start:web` also runs `prisma migrate deploy` and the idempotent Prisma
  seed (safe to run on every deploy — see "Migrations & seed" below) before
  starting the two processes.

## 6 private background services (no public URL)

Each runs a single compiled worker entrypoint from `backend/dist/`. None of
them should be given a public URL/domain — configure them as private
background workers on your platform.

| Service | Start command | Entrypoint | BullMQ queue consumed |
|---|---|---|---|
| Audit/scraper worker | `npm run start:worker:audit` | `backend/dist/workers/scraper.worker.js` | `audit-processing` |
| AI worker | `npm run start:worker:ai` | `backend/dist/workers/ai.worker.js` | `creative-generation` |
| Book-video worker | `npm run start:worker:book-video` | `backend/dist/workers/book-video.worker.js` | `book-manuscript`, `book-video` |
| Email worker | `npm run start:worker:email` | `backend/dist/workers/email.worker.js` | `email-delivery` |
| Analytics worker | `npm run start:worker:analytics` | `backend/dist/workers/analytics.worker.js` | `analytics-refresh` |
| Cron scheduler | `npm run start:cron` | `backend/dist/cron/index.js` | n/a — runs `scheduleDailyAnalytics`, `scheduleWeeklyReport`, `scheduleCleanup` in-process on node-cron schedules |

Each worker requires `REDIS_URL` and will refuse to start without it
(`requireBullConnection()` throws) — this is intentional fail-fast behavior
so a misconfigured worker never silently does nothing. Run **exactly one**
instance of the cron service; the other five workers can be scaled
independently (0–N instances each) since BullMQ workers on the same queue
name safely compete for jobs.

All six build the same way as the web service (`npm run build` from repo
root, which builds `backend` then `frontend`) — a worker service does not
need the frontend build, but building both keeps one shared build command
for every service and avoids service-specific build logic.

## Environment variables

**Every service** (web + all 6 workers) needs:
`DATABASE_URL`, `NODE_ENV=production`, `TZ` (defaults to `Africa/Lagos`).

**Web service only:**
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN` (must be the exact
public URL — never `*` in production, see `backend/src/config/index.ts`),
`FRONTEND_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `BACKEND_INTERNAL_URL`
(defaults to `http://localhost:4000`, only change if you also change the
port Express binds to), `NEXT_PUBLIC_API_URL=/api/v1`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET` (Stripe webhook route lives on the API), Stripe
price IDs.

**Workers that need `REDIS_URL`:** all 6 (audit, AI, book-video, email,
analytics, cron does not use Redis but the other five do).

**Per-worker extras** (only give a service the secrets it actually uses):
- AI / book-video workers: `GEMINI_API_KEY`, `GROQ_API_KEY`,
  `CLOUDINARY_API_SECRET`/`CLOUDINARY_API_KEY`/`CLOUDINARY_CLOUD_NAME`,
  `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (asset storage).
- Email worker: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
  `EMAIL_FROM`.
- Audit worker: no extra third-party keys beyond DB/Redis.
- Analytics worker: no extra third-party keys beyond DB/Redis.

Never expose server secrets through `NEXT_PUBLIC_*` variables — only
`NEXT_PUBLIC_API_URL` (a relative path, not a secret) should be public.

## Migrations & seed

Production must run `prisma migrate deploy` (never `prisma migrate dev`).
This is wired into `start:web`, which runs it before starting Express/
Next.js — a failed migration stops the deploy/startup instead of starting
the app against a stale schema. Migration history in
`backend/prisma/migrations/` must never be deleted or regenerated.

The seed (`backend/prisma/seed.ts`) uses `upsert` on a fixed demo user and
book, so it is idempotent and safe to run on every deploy; it's kept in the
`start:web` chain rather than run once manually.

## Redis / BullMQ

Redis is optional for the web service (rate limiting falls back to
in-memory, and some queues fall back to running inline in the API process
when Redis is unconfigured — see `backend/src/queues/*.ts`) but required
for the six worker processes to do anything. Producers (in
`backend/src/queues/`) and consumers (in `backend/src/workers/`) use these
matching queue names: `audit-processing`, `creative-generation`,
`book-manuscript`, `book-video`, `email-delivery`, `analytics-refresh`.
Do not point production workers at `redis://localhost:6379` — each worker
needs the same real production `REDIS_URL` (e.g. a managed Redis/Upstash
instance) as the web service.

Note: a `calendar-generation` queue is defined in
`backend/src/queues/calendar.queue.ts` but nothing in the codebase enqueues
a job on it and no worker consumes it — pre-existing dead code, unrelated to
this deployment split, left as-is.

## Failure isolation & scaling

Because each worker is its own OS process, a crash in the AI worker,
book-video worker, or email worker cannot take down Express, Next.js, or
each other. Scale each worker service's instance count independently based
on its queue's throughput; run the cron service at exactly 1 instance to
avoid duplicate scheduled jobs.

## Docker / Kubernetes / VPS

`docker-compose.prod.yml` (repo root) containerizes the same architecture:
`frontend` is the only service with a published port, and it proxies
`/api/*` to the private `api` service over the compose network
(`BACKEND_INTERNAL_URL=http://api:4000`) — the same single-origin setup as
the process-based path above, just with `frontend` playing the role of the
public entrypoint instead of `concurrently`. `api`, the six workers, and
`cron` build from `backend/Dockerfile`; `frontend` builds from
`frontend/Dockerfile` (a Next.js `output: "standalone"` image).

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Put a TLS-terminating reverse proxy (nginx, Caddy, Traefik, or your cloud's
load balancer) in front of `frontend`'s published port for a real domain —
that's environment-specific and intentionally left out of the compose file.
The same images work unmodified under Kubernetes/ECS/Cloud Run: one
Deployment/Service for `frontend` (publicly routable), one internal-only
Deployment/Service for `api`, and one Deployment per worker + cron, all
pointed at managed Postgres/Redis instead of the compose Postgres/Redis
containers.

`backend/docker-compose.yml` and `backend/docker-compose.prod.yml` still
exist for running the backend alone (e.g. local backend development against
a separately-run frontend); they predate `docker-compose.prod.yml` and
publish the API's port directly, which is fine for that narrower use case
but is not the single-origin production setup described above.

## CI

`.github/workflows/ci.yml` runs on every PR and push to `main`: backend
(`prisma generate`, typecheck/build, verifies every worker/cron entrypoint
actually compiled, lint, `prisma migrate deploy` + `jest` against a
disposable Postgres service container) and frontend (`next build`). It uses
throwaway secrets for the CI-only Postgres instance — no production
credentials are involved, and CI does not deploy anything.
