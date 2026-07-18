# Project Overview

## Name

**TeachingPlatform** — Online Tutoring Marketplace

## Summary

TeachingPlatform is a Preply/AmazingTalker-style marketplace for live online tutoring. Students discover teachers, book sessions, pay tutors directly, and join embedded video calls. Teachers pay the platform a subscription via PayFast; students pay teachers via the teacher's own PayPal or Stripe.

## Problem

Finding a tutor, scheduling a session, paying, and joining a video call typically requires multiple disconnected tools. Teachers struggle to get discovered; students struggle to book with confidence.

## Solution

One platform for the full tutoring loop:

- Discover teachers on a public marketplace
- Book available time slots with timezone support
- Pay the teacher directly (PayPal/Stripe)
- Join live video sessions in-browser
- Leave reviews after completed sessions
- Teachers subscribe to the platform via PayFast

## Target Users

| Role | Description |
|------|-------------|
| **Instructor (Teacher)** | Marketplace profile, availability, video sessions, linked payment accounts |
| **Student** | Browse, book, pay, join sessions, review |
| **Organization Admin** | Team, billing (PayFast), members |
| **Platform Admin** | Marketplace approval, review moderation (SkilledMinds) |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind, shadcn/ui |
| Backend | Next.js Server Actions, Prisma |
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth |
| Platform billing | PayFast (subscriptions only) |
| Teacher payouts | PayPal + Stripe Connect (student → teacher) |
| Video | Daily.co |
| Deployment | Vercel |

## Current Status

- [x] Repository initialized
- [x] Project folder structure created
- [x] Documentation scaffold created
- [x] Product spec reconciled (PROJECT.md)
- [x] Application bootstrap (Next.js, dependencies)
- [x] Database schema (Prisma — run `npm run db:migrate` when Supabase is connected)
- [ ] Authentication
- [ ] Core marketplace features

## Links

- **Repository:** [github.com/skilledminds1/TeachingPlatform](https://github.com/skilledminds1/TeachingPlatform)
- **Product spec:** [PROJECT.md](../PROJECT.md)
