# BookMarketingOS — Frontend

Next.js 14 (App Router) frontend aligned with the BookMarketingOS project blueprint.

## Stack

- Next.js 14 + TypeScript + Tailwind CSS
- lucide-react, clsx, tailwind-merge, class-variance-authority, zod
- Express backend at `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api/v1`)

## Structure

```
app/
  (marketing)/     landing, pricing, features, about, blog, contact
  (auth)/          login, register, forgot-password, reset-password
  (dashboard)/     dashboard, books, audit, creatives, calendar, analytics, settings/*
  api/health/      BFF health check
components/
  ui/              button, card, input, badge, tabs, table, skeleton, progress, …
  shared/          Header, Footer, Sidebar, EmptyState, LoadingSpinner
lib/
  api/             HTTP client
  auth/            token helpers
  hooks/           useAuth, useDebounce
  validators/      Zod schemas
  constants/       genres, platforms, pricing, routes
hooks/queries|mutations/
types/
middleware.ts
```

## Setup

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Ensure backend is on port 4000.
