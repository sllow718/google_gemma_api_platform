@AGENTS.md

## Project Status

This is a **Gemma API Management Platform** — a full-stack Next.js 16 / TypeScript app where users create, configure, and call Gemma AI API configurations through a browser UI. Full spec is in `Requirements.MD`. Phase-by-phase build plan with exit criteria is in `requirements.md`.

### Completed phases

| Phase | Deliverable | Status |
|---|---|---|
| 1 | Project scaffold (Next.js 16, Tailwind, Jest, tsconfig, vercel.json) | done |
| 2 | Google Apps Script data layer (22 actions, lib/types.ts, lib/sheets.ts) | done |
| 3 | Core library layer (encrypt, auth, googleAI, rateLimit, validate) | done |
| 4 | Auth API routes + tests (signup, login, refresh, logout, me) | done |
| 5 | Saved API CRUD routes + tests + GET /api/gemma/models | done |
| 6 | API execution + call history routes + tests | done |
| 7 | User API key routes + quota logic + tests | done |
| 8 | Zustand auth store + client auth flow + tests | done |
| 9 | Frontend: public pages (`/`, `/login`, `/signup`) | done |
| 10 | Frontend: dashboard + API management UI | done |
| 11 | Frontend: history, settings, global components | done |
| — | Public API endpoint + Quickstart UI (post-Phase-11 feature) | done |
| 12 | Sheets integration tests (10 cases §14.8) | done |
| 13 | Vercel deployment + README documentation | done |

`npm test` → 91 passing, 0 failures.

### Next phase

All 13 phases complete. Project shipped.

### Key architectural decisions

- **Sheets secret**: passes as `body.secret` in POST body (Apps Script cannot read HTTP headers)
- **Refresh cookie**: name `refreshToken`, value `{userId}:{token}` — encodes userId so refresh endpoint can look up the stored token without an extra sheet action
- **Auth helper**: `getAuthPayload(request)` in `lib/auth.ts` — returns `AccessTokenPayload | null`, used by every authenticated route
- **Dynamic params**: Next.js 16 `params` is a `Promise<{id}>` — always `await params` in route handlers
- **listGemmaModels**: calls Google REST API directly (SDK has no listModels); 1-hour in-memory cache in `lib/googleAI.ts`
- **Test pattern**: mock `next/headers` in every test file (lib/auth imports it at module level); use real `signAccessToken` to create auth tokens in tests
- **Password strength**: `lib/passwordStrength.ts` — score-based (length ≥8 + uppercase + digit + special); weak/medium/strong
- **Form validation**: client-side uses Zod `SignupSchema.safeParse`; errors mapped by `issue.path[0]` to field name
- **Auth pages** (`/login`, `/signup`): `'use client'`; call API route → on success `authStore.login(token, user)` → `router.push('/dashboard')`
- **ToastProvider**: wraps `{children}` in root layout; use `useToast()` hook in any client component
- **Dashboard auth guard**: `(dashboard)/layout.tsx` checks for `refreshToken` cookie (server-side); client-side `AuthInitializer` does the full token validation
- **Client data fetching**: dashboard pages use `useEffect` + `useAuthStore` `accessToken` as Bearer token; no server-side data fetching in pages
- **ApiConfigForm**: `onSubmit(FormData)` callback pattern — page handles the fetch, form handles UI/validation only
- **formatUtils**: `formatDate(iso)` → "Jan 15, 2026" (UTC); `truncate(text, max)` → appends "…"
- **Settings URL**: `app/(dashboard)/settings/page.tsx` → `/settings` (route group doesn't add prefix); Navbar links to `/settings` not `/dashboard/settings`
- **New sheets actions** (Phase 11): `updateUserName` and `updatePassword` — call new Apps Script actions that must be added to `Code.gs`
- **ApiKeyManager**: calls `authStore.initialize()` after add/remove to refresh user tier in store
- **Platform API Key**: format `gmp_` + 32 hex chars (UUID without dashes); stored in Users sheet (`platformApiKey` column); auth via `X-API-Key` header on `POST /api/v1/:id/call`
- **Public endpoint**: `POST /api/v1/:id/call` — same quota/call logic as JWT route but authenticated with platform key; no session cookie needed
- **Quickstart component**: collapsible section on API call page; shows endpoint URL + copy-able Node.js snippet; prompts to generate key in Settings if none exists
- **New sheets actions needed in Code.gs**: `setPlatformApiKey`, `clearPlatformApiKey`, `getUserByPlatformApiKey`, `updateUserName`, `updatePassword` — all implemented in apps-script/Code.gs, need redeploy
- **tsconfig setup**: `tsconfig.json` includes all files (tests included); `tsconfig.test.json` used by Jest (overrides moduleResolution to node, adds jest types); `tests/tsconfig.json` extends tsconfig.test.json so IDE picks up jest globals in test files
- **User.platformApiKey**: added to both `User` and `UserProfile` types; all mock user objects in tests must include `platformApiKey: null`

### Manual setup (Phase 2) — COMPLETE

Google Sheets workbook created with 4 tabs, Apps Script deployed as Web App, `SHEETS_WEBHOOK_URL` and `SHEETS_SECRET` set in `.env.local`. Confirmed working via Postman.
