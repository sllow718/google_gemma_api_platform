# Development Plan: Gemma API Management Platform

**Version:** 1.2  
**Last Updated:** 2026-04-26  
**Source:** Requirements.MD v2.0  

---

## Phase Overview

| Phase | Deliverable | Depends On | Status |
|---|---|---|---|
| 1 | Project scaffold & tooling | — | **done** |
| 2 | Google Apps Script + Sheets data layer | 1 | **done** |
| 3 | Core library layer | 2 | **done** |
| 4 | Auth API routes + tests | 3 | **done** |
| 5 | Saved API CRUD routes + tests | 4 | **done** |
| 6 | API execution + call history routes + tests | 5 | pending |
| 7 | User API key routes + quota logic + tests | 6 | pending |
| 8 | Zustand auth store + client auth flow | 4 | pending |
| 9 | Frontend: public pages | 8 | pending |
| 10 | Frontend: dashboard + API management UI | 9 | pending |
| 11 | Frontend: history, settings, global components | 10 | pending |
| 12 | Sheets integration tests + full QA | 7, 11 | pending |
| 13 | Vercel deployment + README documentation | 12 | pending |

**Critical path:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 12 → 13  
**Parallel track:** Phases 8–11 can begin once Phase 4 is complete.

---

## Phase 1 — Project Scaffold & Infrastructure

**Goal:** A runnable skeleton with all tooling wired up before any feature code is written.

### Tasks

- [ ] Initialise Next.js 14 (App Router) project with TypeScript strict mode
- [ ] Configure Tailwind CSS
- [ ] Add ESLint + Prettier
- [ ] Set up `jest.config.ts` with ts-jest and Supertest
- [ ] Commit `.env.example` with all variables from Requirements §12
- [ ] Add `vercel.json` with 30 s function timeout for all API routes
- [ ] Create the full folder structure from Requirements §13 (empty barrel files)

### Files Created

```
next.config.ts
tailwind.config.ts
tsconfig.json
jest.config.ts
vercel.json
.env.example
app/
  (auth)/login/page.tsx
  (auth)/signup/page.tsx
  (dashboard)/layout.tsx
  (dashboard)/dashboard/page.tsx
  (dashboard)/dashboard/apis/new/page.tsx
  (dashboard)/dashboard/apis/[id]/page.tsx
  (dashboard)/dashboard/apis/[id]/edit/page.tsx
  (dashboard)/dashboard/apis/[id]/history/page.tsx
  (dashboard)/settings/page.tsx
  api/auth/signup/route.ts
  api/auth/login/route.ts
  api/auth/logout/route.ts
  api/auth/refresh/route.ts
  api/auth/me/route.ts
  api/apis/route.ts
  api/apis/[id]/route.ts
  api/apis/[id]/call/route.ts
  api/apis/[id]/calls/route.ts
  api/user/apikey/route.ts
  api/gemma/models/route.ts
components/ui/
  Button.tsx
  Input.tsx
  Modal.tsx
  Toast.tsx
  Skeleton.tsx
components/
  ApiCard.tsx
  ApiConfigForm.tsx
  CallPanel.tsx
  CallHistoryTable.tsx
  QuotaBanner.tsx
  ApiKeyManager.tsx
  Navbar.tsx
lib/
  googleAI.ts
  auth.ts
  sheets.ts
  encrypt.ts
  rateLimit.ts
  validate.ts
store/
  authStore.ts
tests/
  auth.test.ts
  apis.crud.test.ts
  apis.call.test.ts
  apis.history.test.ts
  user.apikey.test.ts
  quota.test.ts
  encrypt.test.ts
  sheets.integration.test.ts
  mocks/
    sheets.ts
    googleAI.ts
    encrypt.ts
apps-script/
  Code.gs
```

### Exit Criteria

- `npm run dev` starts without errors
- `npm test` runs and exits with zero failures (zero test suites at this point is fine)

---

## Phase 2 — Google Apps Script Data Layer

**Goal:** A working, deployed HTTPS data layer before any backend code touches it.

### Tasks

- [x] Implement all 22 actions in `apps-script/Code.gs`
  - [x] **Users (10):** `createUser`, `getUserByEmail`, `getUserById`, `updateLastLogin`, `setRefreshToken`, `getRefreshToken`, `clearRefreshToken`, `updateTier`, `incrementCallCounts`, `getUserQuota`
  - [x] **UserApiKeys (3):** `setApiKey`, `getApiKey`, `deleteApiKey`
  - [x] **SavedApis (6):** `createSavedApi`, `getSavedApisByUser`, `getSavedApiById`, `updateSavedApi`, `deleteSavedApi`, `incrementApiCallCount`
  - [x] **CallLogs (3):** `createCallLog`, `getCallLogsByApi`, `deleteCallLogsByApi`
- [x] `lib/types.ts` — TypeScript interfaces for all 4 data models
- [x] `lib/sheets.ts` — fully typed HTTP client with wrappers for all 22 actions
- [x] **MANUAL:** Create Google Sheets workbook with 4 sheets (`Users`, `UserApiKeys`, `SavedApis`, `CallLogs`) and add column headers matching Requirements §5
- [x] **MANUAL:** In Apps Script editor: set Script Properties `SPREADSHEET_ID` and `SHEETS_SECRET`; deploy as Web App (Execute as Me / Anyone); copy URL to `.env.local` as `SHEETS_WEBHOOK_URL`
- [x] **MANUAL:** Smoke-test every action via Postman

> **Note:** Apps Script Web Apps cannot read HTTP request headers. The `SHEETS_SECRET` is passed as `body.secret` in the POST body (handled transparently by `lib/sheets.ts`). The `X-Sheets-Secret` header mentioned in the requirements is effectively replaced by this body field.

### Security

- All requests must include `X-Sheets-Secret` header matching `SHEETS_SECRET`
- Script returns `{ success: false, error: "Unauthorized" }` on missing or incorrect secret

### Exit Criteria

- Every action round-trips correctly verified via curl
- `SHEETS_WEBHOOK_URL` and `SHEETS_SECRET` populated in local env

---

## Phase 3 — Core Library Layer

**Goal:** All shared utilities that backend routes will depend on, with unit tests.

### Tasks

#### `lib/encrypt.ts`
- `encrypt(plaintext: string): { encryptedKey: string; iv: string }` — AES-256-GCM, fresh 12-byte IV per call, returns base64 strings
- `decrypt(encryptedKey: string, iv: string): string` — throws on auth tag failure

#### `lib/auth.ts`
- `signAccessToken(payload: { sub, email, tier }): string` — HS256, 15 min expiry
- `verifyAccessToken(token: string): JwtPayload` — throws on invalid/expired
- `signRefreshToken(): string` — UUID v4
- `setRefreshCookie(res, token)` — httpOnly, Secure, SameSite=Strict, 7-day expiry
- `clearRefreshCookie(res)` — expires the cookie immediately

#### `lib/sheets.ts`
- `sheetsRequest<T>(action: string, payload: object): Promise<T>` — POST to `SHEETS_WEBHOOK_URL` with `X-Sheets-Secret`; throws `SHEETS_UNAVAILABLE` on timeout/error
- Typed wrappers for every action listed in Phase 2

#### `lib/googleAI.ts`
- `callGemma(apiKey, config, prompt, overrides): Promise<GemmaResponse>` — wraps `generateContent`; measures latency; throws `UPSTREAM_ERROR` on failure
- `listGemmaModels(apiKey): Promise<GemmaModel[]>` — wraps `listModels`

#### `lib/validate.ts`
- Zod schemas: `SignupSchema`, `LoginSchema`, `CreateApiSchema`, `UpdateApiSchema`, `CallApiSchema`, `AddApiKeySchema`
- Env var validation schema — validates all required vars on startup

#### `lib/rateLimit.ts`
- `checkRateLimit(ip: string): Promise<void>` — 100 req / 15 min per IP; Vercel KV in production, in-memory Map in development; throws `RATE_LIMIT_EXCEEDED`

### Exit Criteria

- `tests/encrypt.test.ts` passes all 4 cases
- All other lib modules import without errors

---

## Phase 4 — Auth API Routes + Tests

**Goal:** Full authentication flow, callable via Supertest.

### Endpoints

| Method | Route | Behaviour |
|---|---|---|
| POST | `/api/auth/signup` | Validate → bcrypt hash (cost 12) → `createUser` → return access token + set refresh cookie |
| POST | `/api/auth/login` | `getUserByEmail` → verify hash → `updateLastLogin` + `setRefreshToken` → return access token + set refresh cookie |
| POST | `/api/auth/refresh` | Read httpOnly cookie → `getRefreshToken` → validate → `setRefreshToken` (rotate) → return new access token + new cookie |
| POST | `/api/auth/logout` | `clearRefreshToken` → `clearRefreshCookie` → `200 OK` |
| GET | `/api/auth/me` | Verify JWT → `getUserQuota` → return profile + quota fields |

### Error Codes Used

`VALIDATION_ERROR`, `CONFLICT`, `UNAUTHORIZED`, `REFRESH_TOKEN_INVALID`

### Tests (`tests/auth.test.ts`)

All 10 cases from Requirements §14.1. Mocks: `lib/sheets.ts`.

### Exit Criteria

All 10 auth tests pass.

---

## Phase 5 — Saved API CRUD Routes + Tests

**Goal:** Full lifecycle for API configurations.

### Endpoints

| Method | Route | Behaviour |
|---|---|---|
| POST | `/api/apis` | Validate → count existing APIs (reject at 20) → `createSavedApi` → `201` |
| GET | `/api/apis` | `getSavedApisByUser` → return summary fields |
| GET | `/api/apis/:id` | `getSavedApiById` → ownership check → return full config |
| PUT | `/api/apis/:id` | Ownership check → `updateSavedApi` → return updated object |
| DELETE | `/api/apis/:id` | Ownership check → `deleteSavedApi` + `deleteCallLogsByApi` → `204` |
| GET | `/api/gemma/models` | `listGemmaModels(GOOGLE_API_KEY)` → cache 1 hour → return model list |

### Tests (`tests/apis.crud.test.ts`)

All 10 cases from Requirements §14.2.

### Exit Criteria

All 10 CRUD tests pass.

---

## Phase 6 — API Execution + Call History Routes + Tests

**Goal:** Calling Gemma through a saved config; logging results; paginated history.

### `POST /api/apis/:id/call` — Execution Flow

1. `getSavedApiById` → verify ownership
2. **Shared tier:** check `dailyCallCount < dailyLimit`; reject `429 QUOTA_EXCEEDED` if exceeded  
   **BYOK tier:** `getApiKey` → `decrypt(encryptedKey, iv)` → use plaintext key
3. Build generation config: systemPrompt + saved params merged with `overrides`
4. `callGemma(apiKey, config, prompt)` — measure latency
5. `createCallLog` — write to sheet
6. `incrementApiCallCount`, `incrementCallCounts` — update counters
7. Return `{ text, model, finishReason, usage, latencyMs, callLogId }`

### `GET /api/apis/:id/calls`

Ownership check → `getCallLogsByApi(id, page, min(limit, 50))` → return paginated result.

### Tests

- `tests/apis.call.test.ts` — 10 cases from Requirements §14.3
- `tests/apis.history.test.ts` — 4 cases from Requirements §14.4

### Exit Criteria

All 14 call + history tests pass.

---

## Phase 7 — User API Key Routes + Quota Logic + Tests

**Goal:** BYOK tier; daily quota reset; remaining unit test suites complete.

### Endpoints

| Method | Route | Behaviour |
|---|---|---|
| POST | `/api/user/apikey` | `listGemmaModels(providedKey)` → on failure `400 INVALID_API_KEY` → `encrypt(key)` → `setApiKey` → `updateTier("byok")` → `200 { keyHint, tier, isValid }` |
| DELETE | `/api/user/apikey` | `getApiKey` (404 if missing) → `deleteApiKey` → `updateTier("shared")` → `200 { tier }` |

### Lazy Daily Reset (inside `incrementCallCounts` Apps Script action)

- Compare `dailyCallResetAt` date to current UTC date
- If different day: reset `dailyCallCount = 0`, update `dailyCallResetAt`
- Then increment both `dailyCallCount` and `totalCallCount`

### Tests

- `tests/user.apikey.test.ts` — 5 cases from Requirements §14.5
- `tests/quota.test.ts` — 4 cases from Requirements §14.6
- `tests/encrypt.test.ts` — 4 cases from Requirements §14.7 (written in Phase 3, verified here)

### Exit Criteria

All 13 remaining unit tests pass. `npm test` is fully green.

---

## Phase 8 — Zustand Auth Store + Client Auth Flow

**Goal:** Persistent in-memory session; silent refresh; no localStorage usage.

### `store/authStore.ts`

```ts
interface AuthStore {
  accessToken: string | null
  user: UserProfile | null
  isLoading: boolean
  login(token: string, user: UserProfile): void
  logout(): void
  setToken(token: string): void
  initialize(): Promise<void>   // called on app mount
}
```

### Client Auth Flow

1. `initialize()` calls `POST /api/auth/refresh` silently on page load
2. On success: store new access token + user profile; decode `exp` from JWT
3. On failure: redirect to `/login`
4. `setTimeout(() => initialize(), (exp - now - 60) * 1000)` — background refresh 1 min before expiry
5. All API fetch helpers read `authStore.getState().accessToken`

### Exit Criteria

- Session survives page reload (refresh cookie is httpOnly → persists across tabs/reloads)
- Expired token triggers silent refresh without visible interruption

---

## Phase 9 — Frontend: Public Pages

**Goal:** Visitor-facing UI.

### Pages

#### Landing (`/`)
- Product description + feature highlights
- Tier comparison: shared (50 calls/day) vs BYOK (unlimited)
- "Sign Up" and "Log In" CTA buttons

#### Login (`/login`)
- Email + password fields
- Inline error message on failure (no page reload)
- Link to `/signup`
- On success: `authStore.login()` then `router.push('/dashboard')`

#### Sign Up (`/signup`)
- Name, email, password, confirm password
- Password strength indicator (weak / medium / strong)
- Field-level validation errors via Zod `SignupSchema`
- On success: redirect to `/dashboard`

### Exit Criteria

Manual test: sign up → redirected to dashboard; log out → log in → redirected to dashboard.

---

## Phase 10 — Frontend: Dashboard + API Management UI

**Goal:** Main authenticated surface.

### Dashboard Layout (`(dashboard)/layout.tsx`)
- Server-side auth guard: calls `GET /api/auth/me`; redirects to `/login` if `401`
- Renders `<Navbar />` wrapping all dashboard pages

### Dashboard (`/dashboard`)
- **Quota/tier banner (`<QuotaBanner />`):**
  - Shared: "X / 50 calls used today" progress bar
  - BYOK: "Unlimited — using your own key"
- **API card grid:** `<ApiCard />` per config showing name, model, call count, last updated
- **"New API" button:** disabled with tooltip when user has 20 APIs; empty state illustration when list is empty

### Create/Edit API Form (`/dashboard/apis/new` + `/dashboard/apis/:id/edit`)

`<ApiConfigForm />` pre-populated on edit:

| Field | Component |
|---|---|
| Name | Text input |
| Description | Textarea |
| Model | Dropdown from `GET /api/gemma/models` |
| System Prompt | Textarea with tooltip |
| Temperature | Slider (0–2) + numeric input |
| Top P | Slider (0–1) + numeric input |
| Top K | Numeric input |
| Max Output Tokens | Numeric input (capped at 4096 for shared tier) |
| Stop Sequences | Tag input (add/remove strings) |
| Safety Settings | Per-category dropdown |

### API Call Page (`/dashboard/apis/:id`)

- Config summary panel (read-only) with Edit + Delete buttons
- `<CallPanel />`: prompt textarea, collapsible overrides, "Call API" button with spinner
- Response area: formatted text, token counts, latency, finish reason, "Copy response" button
- Quota warning banner when ≤ 10 calls remain (shared tier)
- Last 5 call log entries; "View all history" link

### Exit Criteria

Manual golden path: create API → call API → see response → check call count incremented on card.

---

## Phase 11 — Frontend: History, Settings, Global Components

**Goal:** Complete the UI surface.

### Call History (`/dashboard/apis/:id/history`)
- Paginated table (20/page), columns: timestamp, prompt preview, response preview, tokens, latency, tier, finish reason
- Click row → slide-over panel with full prompt + full response

### Settings (`/dashboard/settings`)

**Account section:**
- Display name inline edit
- Email read-only
- Change password form (current + new + confirm)

**Google API Key section (`<ApiKeyManager />`):**
- Status: "Using shared key (50 calls/day)" or "Using your own key (ending in `xxxx`)"
- Add/Replace: text input + "Save Key" button; spinner during validation; success/error message
- Remove: button visible only when BYOK active; requires confirmation dialog
- Info callout: explains tiers + link to Google Cloud Console

### Global Components

- `<Navbar />` — logo, Dashboard link, Settings link, avatar dropdown (name, email, logout)
- `<Toast />` — top-right success/error toasts for all mutating actions
- Loading skeletons for dashboard grid, history table, settings data fetches
- Error boundary with generic fallback + retry button

### Exit Criteria

Manual walkthrough: add BYOK key → verify tier badge changes → remove key → verify revert.

---

## Phase 12 — Sheets Integration Tests + Full QA

**Goal:** End-to-end verification against a real (staging) sheet before deployment.

### Integration Tests (`tests/sheets.integration.test.ts`)

Requires `SHEETS_WEBHOOK_URL`, `SHEETS_SECRET` pointing to a dedicated staging workbook.

All 10 cases from Requirements §14.8:
- `createUser` + `getUserByEmail` round-trip
- `setApiKey` + `getApiKey` round-trip
- `deleteApiKey` + `getApiKey` → `{ success: false }`
- `createSavedApi` + `getSavedApiById` round-trip
- `deleteSavedApi` + `getSavedApiById` → `{ success: false }`
- `createCallLog` + `getCallLogsByApi` round-trip
- `deleteCallLogsByApi` → empty result
- `incrementApiCallCount` → `callCount` increases by 1
- `incrementCallCounts` on same day → both counters increase
- `incrementCallCounts` on new UTC day → `dailyCallCount` resets to 1

### Full QA Checklist

- [ ] Sign up → session persists on reload
- [ ] Create API configuration with all fields
- [ ] Call API (shared tier) → response displayed
- [ ] Exhaust daily quota → `429` shown with friendly message
- [ ] Add BYOK key → tier badge changes
- [ ] Call API (BYOK tier) → succeeds beyond shared quota
- [ ] View call history → pagination works → slide-over shows full text
- [ ] Edit API config → changes saved
- [ ] Delete API → removed from dashboard
- [ ] Remove BYOK key → reverts to shared tier
- [ ] 20-API limit enforced → "New API" button disabled

### Exit Criteria

`npm test` green. `npm run test:integration` green. All QA checklist items checked.

---

## Phase 13 — Vercel Deployment + Documentation

**Goal:** Live on Vercel with complete README.

### Deployment Checklist (Requirements §15.2)

- [ ] All env vars configured in Vercel dashboard (Production + Preview)
- [ ] `ENCRYPTION_SECRET` is exactly 32 bytes, base64-encoded, cryptographically random
- [ ] `JWT_SECRET` is at least 32 random characters
- [ ] Google Sheets workbook live with correct headers
- [ ] Apps Script deployed and URL copied to `SHEETS_WEBHOOK_URL`
- [ ] `GOOGLE_API_KEY` has Generative Language API enabled in Google Cloud Console
- [ ] `NEXT_PUBLIC_APP_URL` set to production Vercel domain
- [ ] `npm test` passing on `main` branch
- [ ] GitHub → Vercel auto-deploy configured

### README Sections (Requirements §16)

1. Architecture overview (frontend ↔ Next.js API routes ↔ Apps Script ↔ Google AI API)
2. Local development (`npm install`, `.env` setup, `npm run dev`)
3. Google Sheets setup (workbook creation, sheet names, column headers)
4. Apps Script setup (deploy `Code.gs`, publish as Web App, copy URL)
5. Two-tier key system (shared vs BYOK, how to obtain a Google API key)
6. Full API reference (all endpoints, request/response shapes, error codes)
7. Running tests (`npm test` + `npm run test:integration`)
8. Deployment to Vercel (step-by-step env var configuration)

### Exit Criteria

All 13 acceptance criteria in Requirements §19 verified on the live Vercel URL.
