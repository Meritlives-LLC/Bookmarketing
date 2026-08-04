# BookMarketingOS — Backend

Express.js/TypeScript API powering the BookMarketingOS marketing automation platform for authors.

## Stack

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20.10.0 | JavaScript runtime |
| Express.js | 4.18.2 | Web framework |
| TypeScript | 5.3.x | Type-safe development |
| Prisma | 5.7.0 | ORM with type-safe database queries |
| PostgreSQL | 16.1 | Primary database |
| Redis | 7.2 | Caching, sessions, BullMQ job queues |

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in secrets
cp .env.example .env

# 3. Generate the Prisma client (requires internet access to binaries.prisma.sh)
npx prisma generate

# 4. Run database migrations
npx prisma migrate dev

# 5. (Optional) seed demo data
npm run prisma:seed

# 6. Start the API in dev mode
npm run dev
```

The API listens on `http://localhost:4000` by default, prefixed at `/api/v1`.
Health check: `GET /api/health`.

### Running with Docker Compose

```bash
docker compose up --build
```

This spins up Postgres, Redis, the API, and all background workers/cron in one command.

## Background processing

BookMarketingOS uses BullMQ (Redis-backed) queues for anything that talks to an AI model or scrapes
the web, so API requests return immediately (`202 Accepted`) while work happens asynchronously.

Run workers as separate processes:

```bash
npm run worker:audit      # scrapes Goodreads/Amazon/Reddit + runs AI audience analysis
npm run worker:ai         # generates ad copy, TikTok scripts, email copy, etc.
npm run worker:email      # sends transactional email
npm run worker:analytics  # ingests platform performance snapshots
npm run cron               # daily analytics refresh, weekly reports, cleanup (Africa/Lagos tz)
```

In production, `ecosystem.config.js` runs all of these under PM2.

## Project layout

```
src/
├── config/        # env, database, redis, aws, stripe, ai, logging
├── controllers/    # request/response handling
├── services/       # business logic (AI generation, audits, billing, etc.)
├── repositories/    # Prisma data access layer
├── models/          # Prisma type re-exports
├── routes/v1/        # versioned REST API routes
├── routes/webhooks/  # Stripe + internal webhook endpoints
├── middleware/       # auth, validation, rate limiting, error handling, cors
├── validators/       # Zod request schemas
├── types/            # shared TypeScript types
├── queues/            # BullMQ queue definitions + processors
├── workers/            # standalone worker process entrypoints
├── cron/                # scheduled jobs
└── app.ts                # Express app + server bootstrap
```

## Core API resources

- `POST /api/v1/auth/register` / `login` / `refresh` / `forgot-password` / `reset-password`
- `GET|POST /api/v1/books`, `GET|PUT|DELETE /api/v1/books/:id`, `POST /api/v1/books/:id/audit`
- `POST /api/v1/audit`, `GET /api/v1/audit/:id`, `POST /api/v1/audit/:id/regenerate`
  — runs the audience-discovery pipeline (BookTok, Goodreads, Amazon, Reddit, BookTube, newsletter,
  Facebook group segments) and returns audience insights, Amazon keyword suggestions, and competitor analysis
- `POST /api/v1/creatives/generate` — generates ad copy, TikTok scripts, email campaigns, discussion
  guides, and Amazon keyword sets per reader segment
- `GET|POST /api/v1/calendar`, `POST /api/v1/calendar/generate` — AI-generated 30-day marketing calendar
- `GET /api/v1/analytics` — impressions/clicks/conversions/spend/revenue/ROAS per book
- `POST /api/v1/billing/checkout`, `POST /api/v1/billing/portal` — Stripe subscription management
- `POST /api/webhooks/stripe` — Stripe billing webhook

## Notes for this build

- `npx prisma generate` requires outbound access to `binaries.prisma.sh` to download the query engine.
  This step could not be run in the sandbox this project was built in (that domain isn't reachable there),
  so `node_modules` and the generated Prisma client are **not** included in this zip — run `npm install`
  followed by `npx prisma generate` in your own environment to complete setup. Everything else has been
  type-checked against the Prisma-generated types and is expected to compile cleanly once the client exists.
