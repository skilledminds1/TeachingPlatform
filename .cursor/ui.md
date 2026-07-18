# UI Rules

## Design Philosophy

Minimal.

Modern.

Apple inspired.

Linear inspired.

Notion inspired.

Large spacing.

Rounded corners.

Soft shadows.

Smooth animations.

Dark mode first.

Fully responsive.

Consistent spacing.

Accessible colors.

Professional SaaS appearance.

---

## Visual Language

### Inspiration

| Reference | Apply |
|-----------|-------|
| Apple | Clean hierarchy, generous whitespace, restrained color |
| Linear | Sharp typography, subtle borders, focused layouts |
| Notion | Content-first pages, calm surfaces, readable blocks |

### Spacing

Use a consistent spacing scale — prefer generous over cramped:

| Token | Use |
|-------|-----|
| `p-6` / `p-8` | Page and card padding |
| `gap-6` / `gap-8` | Section and grid gaps |
| `space-y-6` / `space-y-8` | Vertical content rhythm |
| `mb-8` / `mb-12` | Section separation |

Never pack UI tightly. When in doubt, add space.

### Corners & Shadows

```tsx
// Cards and panels
className="rounded-xl border border-border bg-card shadow-sm"

// Modals and dropdowns
className="rounded-lg shadow-md"

// Buttons and inputs (shadcn defaults)
className="rounded-md"
```

- Default radius: `rounded-lg` for containers, `rounded-md` for controls
- Shadows: soft only — `shadow-sm`, `shadow-md`. Never harsh drop shadows
- Borders: subtle — `border-border` at low opacity, not heavy outlines

### Animations

Use smooth, subtle motion — never flashy:

```tsx
className="transition-colors duration-200"
className="transition-all duration-300 ease-in-out"
```

- Hover states: color and opacity transitions
- Page transitions: fade or slide, 200–300ms
- Loading: skeleton pulse, not spinners alone
- Respect `prefers-reduced-motion` — disable animations when set

### Dark Mode First

Design and build in dark mode first, then verify light mode.

- Use CSS variables from `src/styles/globals.css` — never hardcode hex colors
- Surfaces: layered dark grays (`background`, `card`, `muted`)
- Text: high contrast foreground on dark surfaces
- Accents: restrained primary color — not neon or oversaturated
- Test both modes before shipping any UI

```tsx
// ❌ BAD
<div className="bg-white text-black">

// ✅ GOOD
<div className="bg-background text-foreground">
```

## Stack

- **Tailwind CSS** for all styling — no CSS modules, styled-components, or inline styles
- **shadcn/ui** for primitives — do not rebuild Button, Dialog, Input, etc.
- **Lucide React** for icons
- **Inter** for UI text via `next/font`

## Component Location

```
src/components/ui/                 → shadcn/ui primitives (do not modify heavily)
src/components/layout/           → Sidebar, TopBar, PageHeader
src/features/[name]/components/  → feature-specific UI
```

## Patterns

### Page Layout

Every authenticated page uses the shared shell with generous spacing:

```tsx
<PageHeader
  title="Courses"
  description="Manage your courses"
  action={<Button>Create Course</Button>}
/>
<div className="space-y-8 p-6 md:p-8">
  {/* page content */}
</div>
```

### Empty States

Always provide an empty state with a clear action:

```tsx
<EmptyState
  icon={BookOpen}
  title="No courses yet"
  description="Create your first course to get started."
  action={<Button>Create Course</Button>}
/>
```

### Loading

Use skeleton components matching the final layout shape — not spinners alone.

### State Handling

Always handle all three states:

- **Loading** — skeleton matching layout shape
- **Error** — clear message with retry action
- **Empty** — illustration/icon, description, primary action

## Styling Rules

- Use Tailwind utility classes. Avoid arbitrary values unless necessary.
- Use semantic tokens: `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`
- Do not hardcode hex colors in components
- Responsive: mobile-first (`sm:`, `md:`, `lg:`) — fully responsive at every breakpoint
- Keep components below 300 lines — split when exceeded

```tsx
// ❌ BAD
<div style={{ color: "#2563EB" }}>

// ✅ GOOD
<div className="text-primary">
```

## Accessibility (Required)

- WCAG 2.1 AA minimum — accessible colors in both dark and light mode
- All interactive elements must be keyboard-accessible
- Icon-only buttons need `aria-label`
- Form inputs must have associated `<label>` or `aria-label`
- Use semantic HTML: `main`, `nav`, `section`, `article`
- Focus rings must remain visible — do not remove `ring` utilities
- Minimum contrast ratio 4.5:1 for body text, 3:1 for large text

## Forms

- Use shadcn/ui `Form` components with React Hook Form + Zod resolver
- Show inline validation errors below fields
- Disable submit button while loading; show spinner in button
- Use `toast` for success/error feedback after submission

## Do Not

- Do not use `dangerouslySetInnerHTML`
- Do not use inline styles
- Do not import heavy UI libraries beyond shadcn/ui
- Do not put business logic in UI components
- Do not fetch data in client components — use Server Components or server actions
- Do not use harsh shadows, tight spacing, or oversaturated colors

## Role-Aware UI

| Role | Default landing | Sidebar items |
|------|----------------|---------------|
| Instructor | `/dashboard` | Availability, Bookings, Profile, Payments, Messages |
| Student | `/dashboard` | Find Teachers, My Bookings, Messages |
| Admin | `/dashboard` | + Members, Billing |
| Platform Admin | `/admin` | Approvals, Reviews, Analytics |

Hide actions the current role cannot perform — do not show disabled buttons without explanation.

---

## Related Rules

- `rules.md` — Master project rules
- `coding-standards.md` — TypeScript, RHF, Zod, TanStack Query
- `database.md` — Prisma schema and queries
- `security.md` — Auth, RBAC, secrets
- `api.md` — Server actions and API routes
