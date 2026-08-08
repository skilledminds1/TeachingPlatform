# UI

## Design System

Minimal, modern, Apple/Linear/Notion inspired. **Dark mode first.** Professional SaaS appearance for a live tutoring marketplace — every surface serves discover → book → join → review. There is no catalogue, library, or content-consumption UI.

See [.cursor/ui.md](../.cursor/ui.md) for implementation rules.

## Stack

| Tool | Purpose |
|------|---------|
| Tailwind CSS | Styling |
| shadcn/ui | Components |
| Lucide React | Icons |
| Inter | Typography via next/font |

## Layout

```
Top Bar — logo, user menu, (org switcher for team)
Sidebar — role-specific navigation
Main — page content with generous spacing (p-6 md:p-8)
```

## Key Pages

| Page | Route | Role |
|------|-------|------|
| Landing | `/` | Public |
| Marketplace | `/find-tutor` | Public |
| Teacher profile | `/find-tutor/[slug]` | Public |
| Sign in / up | `/login`, `/register` | Public |
| Dashboard | `/dashboard` | All |
| Availability | `/availability` | Instructor |
| Calendar / Bookings | `/bookings` | Instructor, Student |
| Video session | `/sessions/[id]` | Instructor, Student |
| Profile settings | `/settings/profile` | Instructor |
| Payment accounts | `/settings/payments` | Instructor |
| Billing (PayFast) | `/settings/billing` | Org admin |
| Platform admin | `/admin/*` | Platform admin |

## Role Navigation

**Instructor:** Dashboard, Profile, Availability, Bookings, Messages, Settings (payments, billing)

**Student:** Dashboard, Find Teachers, My Bookings, Messages

**Org Admin:** + Members, Billing

**Platform Admin:** `/admin` — Approvals, Reviews, Analytics (separate layout)

## Marketplace UI

- Teacher cards: photo, name, subjects, rate, rating, next available slot
- Filters sidebar: subject, price range, rating, availability
- Search bar with instant results
- Profile page: bio, reviews, availability calendar, Book CTA

## Video Session UI

- Pre-session lobby with countdown
- Embedded LiveKit room — full-width, minimal chrome
- Post-session: review prompt modal

## States

Always handle: loading (skeleton), error (retry), empty (action CTA).

## Accessibility

WCAG 2.1 AA — keyboard nav, focus rings, aria labels, 4.5:1 contrast in both themes.

## Responsive

Mobile-first. Marketplace and booking flow fully usable on mobile.
