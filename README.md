# Amazing Skills

Online tutoring marketplace — discover a teacher, book a slot, join a live video lesson, leave a
review. Live 1:1 tutoring only; there are no self-paced courses.

## Stack

- **Next.js 16** (App Router, Turbopack)
- **TypeScript** (strict)
- **Tailwind CSS v4** + **shadcn/ui**
- **React Hook Form** + **Zod**
- **TanStack Query**
- **Prisma** + **Supabase** (coming in Phase 1)
- **PayFast** (teacher subscriptions to the platform — the only money the platform collects)
- **PayPal** (student → teacher lesson payments, paid into the teacher's own account)
- **LiveKit Cloud** (live video lessons)

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
