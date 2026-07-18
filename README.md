# TeachingPlatform

Online tutoring marketplace — discover teachers, book live video sessions, and learn online.

## Stack

- **Next.js 16** (App Router, Turbopack)
- **TypeScript** (strict)
- **Tailwind CSS v4** + **shadcn/ui**
- **React Hook Form** + **Zod**
- **TanStack Query**
- **Prisma** + **Supabase** (coming in Phase 1)
- **PayFast** (subscriptions) · **PayPal/Stripe** (teacher payments)

## Getting started

```bash
npm install
cp .env.example .env.local
# Fill in Supabase credentials in .env.local (see supabase/README.md)

npm run db:migrate   # Apply Prisma migrations (requires DATABASE_URL)
npm run db:seed      # Seed plans, subjects, demo data

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |

## Documentation

- [PROJECT.md](./PROJECT.md) — Product specification
- [TODO.md](./TODO.md) — Development backlog
- [docs/](./docs/) — Technical documentation

## Repository

[github.com/skilledminds1/TeachingPlatform](https://github.com/skilledminds1/TeachingPlatform)
