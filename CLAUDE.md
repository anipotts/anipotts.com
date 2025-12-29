# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev    # Start development server at http://localhost:3000
npm run build  # Production build
npm run start  # Start production server
npm run lint   # Run ESLint
```

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=<supabase_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase_anon_key>
ADMIN_PASSWORD=<admin_password>
```

Optional:
```
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>  # For admin actions with strict RLS
```

## Architecture

### Terminal Window UI
The entire site is rendered inside a simulated macOS terminal window. The window has four states (`open`, `collapsed`, `minimized`, `fullscreen`) managed by `WindowContext`. Key components:
- `WindowContainer` - Main window wrapper with resize/state transitions
- `WindowControls` - Red/yellow/green traffic light buttons
- `WindowInner` - Contains Navbar, page content, and Footer
- `TerminalPromptCentered` / `MinimizedPill` - Alternate views for collapsed/minimized states

### Context Providers (in layout.tsx)
- `PostHogProvider` - Analytics tracking
- `AdminProvider` - Admin authentication state (password-based via `ADMIN_PASSWORD`)
- `WindowProvider` - Terminal window state management

### Thoughts/Blog System
Supabase-powered blog at `/thoughts`. Admin interface at `/thoughts/admin` requires password authentication.

Supabase `thoughts` table schema:
- `id` (uuid), `slug` (text, unique), `title`, `summary`, `content` (all text)
- `tags` (text[]), `created_at`, `updated_at` (timestamptz), `published` (boolean), `views` (int)

Server actions in `src/app/thoughts/actions.ts` handle CRUD operations.

### Data Sources
- **Static**: Projects in `src/data/projects.ts`
- **Dynamic**: Thoughts from Supabase

### API Routes
- `/api/send` - Contact form emails via Resend
- `/api/favorite-number` - Easter egg endpoint

### Path Aliases
`@/*` maps to `./src/*` (configured in tsconfig.json)

## Key Patterns

- Pages use `export const revalidate = 0` for fresh Supabase data on each request
- `FadeIn` component wraps content for staggered entrance animations (Framer Motion)
- Supabase client returns `null` if not configured - always check before use
- PostHog proxied through Next.js rewrites to `/ingest/*` (see next.config.ts)
