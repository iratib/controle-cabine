# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dev server

```
npx serve . --listen 4000
```

No build step. Files are served as-is. The app uses ES modules via `type="module"` scripts — always run through a local HTTP server, never open HTML files directly with `file://`.

## Supabase credentials

Set in `js/supabase-client.js` — the two constants `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Without valid values the app loads but all data operations silently fail.

## Architecture

**Three-page app with role-based routing:**

- `index.html` — login only; after auth, `auth.js:redirectByRole()` sends `admin` → `admin.html`, `agent` → `agent.html`
- `agent.html` + `js/agent.js` — field agent filling inspection forms
- `admin.html` + `js/admin.js` — read-only dashboard, validation, export
- Every page calls `requireRole(expectedRole)` on load; wrong role or no session → redirect to `index.html`

**Module dependency graph:**

```
index.html  → auth.js → supabase-client.js
agent.html  → agent.js → supabase-client.js, auth.js, utils.js
admin.html  → admin.js → supabase-client.js, auth.js, utils.js
```

`utils.js` holds the three shared helpers: `showToast`, `formatDate`, `getStatutBadge`. Do **not** import `agent.js` or `admin.js` from `index.html` — those modules call `init()` at the top level which triggers role checks and causes redirect loops.

**Inspection form data model:**

`FICHE_STRUCTURE` (defined identically in both `agent.js` and `admin.js`) is the canonical list of zones/points. Each point maps to a row in the `controles` table keyed by `(vol_id, zone, sous_zone, point_controle)`. The agent page uses this structure to build the accordion UI; the admin page uses it to render read-only fiche views.

**Auto-save pattern in `agent.js`:**

Every C/NC/NA radio change → debounced 1 s → `supabase.from('controles').upsert(...)`. If offline, data is saved to `localStorage` under key `offline_{vol_id}` and synced on `window.online`.

**Photo upload flow:**

Client-side compression (canvas, max 800 px, 0.75 quality) → upload to Supabase Storage bucket `photos-controle` at path `{vol_id}/{zone}/{timestamp}_{filename}` → insert row in `photos` table with `url_publique`.

## Database

Schema in `supabase/schema.sql`. Key constraint: agents can only read/write their own `vols`; RLS enforces this. The `profiles` table stores role (`admin` | `agent`) and must be populated manually after creating auth users — Supabase Auth does not auto-insert profiles.

## Deployment

Cloudflare Pages — framework preset: None, build command: empty, output directory: `/`.
