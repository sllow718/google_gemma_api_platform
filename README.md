# Gemma API Platform

A full-stack API management platform built with Next.js 16 and TypeScript. Users create, configure, and invoke Gemma AI model configurations through a browser UI. The platform supports two usage tiers (shared key vs bring-your-own-key), per-user daily quotas, call history, and a public REST API for programmatic access.

---

## Architecture

```
Browser UI (Next.js App Router)
        │
        ▼
Next.js API Routes (/api/*)
        │               │
        ▼               ▼
Supabase Postgres   Google Generative AI API
  (users, configs,     (Gemma models)
   call logs)
```

- **Frontend**: React server/client components, Zustand auth store, Tailwind CSS
- **API layer**: Next.js Route Handlers (all under `app/api/`)
- **Database**: Supabase Postgres — schema in `supabase/migrations/20260426_migrate_to_supabase.sql`
- **AI**: Google Generative AI SDK (`@google/generative-ai`) calling Gemma models
- **Auth**: JWT access tokens (15 min) + HTTP-only refresh cookie (7 days)
- **Encryption**: AES-256-GCM for stored user API keys (`lib/encrypt.ts`)

---

## Local Development

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works)
- A Google Cloud project with the **Generative Language API** enabled

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the template and fill in each value:

```bash
cp .env.local.example .env.local
```

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key from Supabase dashboard → Settings → API |
| `JWT_SECRET` | Random string ≥32 characters — used to sign access tokens |
| `ENCRYPTION_SECRET` | 32-byte cryptographically random value, base64-encoded — used to encrypt stored API keys |
| `GOOGLE_API_KEY` | Google Cloud API key with Generative Language API enabled |
| `NEXT_PUBLIC_APP_URL` | Base URL of the app (e.g. `http://localhost:3000` locally) |
| `SHARED_TIER_DAILY_LIMIT` | (optional) Daily call limit for shared-tier users; defaults to `50` |
| `API_TIMING_LOGS` | (optional) Set to `1` to log per-request AI latency to stdout |

Generate `ENCRYPTION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Generate `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Set up the database

Run the migration against your Supabase project:

```bash
# Using the Supabase CLI
npx supabase db push

# Or apply the SQL directly in the Supabase SQL editor:
# supabase/migrations/20260426_migrate_to_supabase.sql
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Two-Tier Key System

| Tier | Who | Daily limit | API key used |
|---|---|---|---|
| **shared** | Default for new accounts | 50 calls/day (configurable) | Platform's `GOOGLE_API_KEY` |
| **byok** | Users who add their own Google API key | Unlimited | User's own key (stored encrypted) |

Users add their Google API key in **Settings → API Key**. The platform encrypts it at rest with AES-256-GCM using `ENCRYPTION_SECRET`. Once added the user's tier automatically upgrades to `byok`.

To obtain a Google API key: [Google AI Studio](https://aistudio.google.com/app/apikey) — create a key, then enable the **Generative Language API** in [Google Cloud Console](https://console.cloud.google.com/).

---

## Full API Reference

All authenticated endpoints require a `Bearer <accessToken>` header unless noted.

### Auth

#### `POST /api/auth/signup`
Create a new account.

```json
// Request
{ "email": "user@example.com", "password": "S3cur3Pass!", "name": "Alice" }

// Response 201
{ "user": { "id": "...", "email": "...", "name": "...", "tier": "shared", ... } }
```

#### `POST /api/auth/login`
Authenticate and receive tokens.

```json
// Request
{ "email": "user@example.com", "password": "S3cur3Pass!" }

// Response 200 — sets HttpOnly `refreshToken` cookie
{ "accessToken": "...", "user": { ... } }
```

#### `POST /api/auth/refresh`
Exchange a valid refresh cookie for a new access token.

```json
// Response 200
{ "accessToken": "..." }
```

#### `POST /api/auth/logout`
Invalidate the refresh token and clear the cookie.

```json
// Response 200
{ "ok": true }
```

#### `GET /api/auth/me`
Return the current user's profile.

```json
// Response 200
{ "user": { "id": "...", "email": "...", "name": "...", "tier": "shared", "totalCallCount": 0, "dailyCallCount": 0, "platformApiKey": null } }
```

---

### Saved API Configurations

#### `GET /api/apis`
List all saved API configurations for the authenticated user.

```json
// Response 200
{ "apis": [ { "id": "...", "name": "...", "model": "gemma-3-27b-it", ... } ] }
```

#### `POST /api/apis`
Create a new configuration.

```json
// Request
{
  "name": "My summariser",
  "description": "Summarises text",
  "model": "gemma-3-27b-it",
  "temperature": 0.7,
  "topP": null,
  "topK": null,
  "maxOutputTokens": 1024,
  "systemPrompt": "You are a concise summariser.",
  "stopSequences": [],
  "safetySettings": []
}

// Response 201
{ "api": { "id": "...", ... } }
```

#### `GET /api/apis/:id`
Get a single configuration.

#### `PUT /api/apis/:id`
Update a configuration (same body shape as POST).

#### `DELETE /api/apis/:id`
Delete a configuration.

---

### Executing a Configuration (Authenticated)

#### `POST /api/apis/:id/call`
Run the configuration with a prompt. Requires JWT auth.

```json
// Request
{ "prompt": "Summarise this article: ...", "maxOutputTokens": 512 }

// Response 200
{
  "responseText": "...",
  "callLog": { "id": "...", "prompt": "...", "responseText": "...", "createdAt": "..." }
}
```

**Error codes**

| Status | Code | Meaning |
|---|---|---|
| 402 | `QUOTA_EXCEEDED` | Daily call limit reached (shared tier) |
| 404 | `NOT_FOUND` | Configuration not found |
| 429 | `RATE_LIMITED` | Too many requests |
| 502 | `GOOGLE_AI_ERROR` | Upstream AI API error |

---

### Call History

#### `GET /api/apis/:id/calls`
Paginated call history for a configuration.

```
GET /api/apis/:id/calls?limit=20&offset=0
```

```json
// Response 200
{ "calls": [ { "id": "...", "prompt": "...", "responseText": "...", "createdAt": "..." } ], "total": 42 }
```

---

### Available Models

#### `GET /api/gemma/models`
List available Gemma models (cached 1 hour).

```json
// Response 200
{ "models": ["gemma-3-27b-it", "gemma-3-12b-it", ...] }
```

---

### User Settings

#### `POST /api/user/apikey`
Save (or replace) the user's Google API key to upgrade to `byok` tier.

```json
// Request
{ "apiKey": "AIzaSy..." }

// Response 200
{ "keyHint": "AIzaSy...xxxx" }
```

#### `DELETE /api/user/apikey`
Remove the stored key and downgrade back to `shared` tier.

#### `GET /api/user/profile`
Alias for `/api/auth/me`.

#### `PUT /api/user/profile`
Update display name.

```json
// Request
{ "name": "Alice B." }
```

#### `PUT /api/user/password`
Change password.

```json
// Request
{ "currentPassword": "...", "newPassword": "..." }
```

#### `POST /api/user/platformkey`
Generate a new platform API key (`gmp_` + 32 hex chars) for programmatic access.

```json
// Response 200
{ "platformApiKey": "gmp_..." }
```

#### `DELETE /api/user/platformkey`
Revoke the platform API key.

---

### Public REST API

No session cookie needed — authenticate with `X-API-Key: gmp_...` instead.

#### `POST /api/v1/:id/call`
Execute a saved configuration by ID.

```bash
curl -X POST https://your-app.vercel.app/api/v1/<config-id>/call \
  -H "X-API-Key: gmp_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, Gemma!"}'
```

```json
// Response 200
{ "responseText": "...", "callLog": { ... } }
```

Quota and daily limits apply identically to the browser-based call endpoint.

---

## Running Tests

```bash
# Unit + integration tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

The test suite uses Jest with `ts-jest`. All external dependencies (Supabase, Google AI) are mocked. Run `npm test` before every push; CI will reject branches with failures.

---

## Deployment to Vercel

1. Push the repo to GitHub and import it in the [Vercel dashboard](https://vercel.com/new).

2. Set the following environment variables in **Settings → Environment Variables** (Production + Preview):

   | Variable | Notes |
   |---|---|
   | `SUPABASE_URL` | Supabase project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role key (keep secret) |
   | `JWT_SECRET` | ≥32 random characters |
   | `ENCRYPTION_SECRET` | 32-byte base64 string (see above) |
   | `GOOGLE_API_KEY` | Google Cloud key with Generative Language API |
   | `NEXT_PUBLIC_APP_URL` | Your production Vercel domain (e.g. `https://your-app.vercel.app`) |
   | `SHARED_TIER_DAILY_LIMIT` | (optional) default `50` |

3. Vercel auto-deploys on every push to `main`.

4. Apply the database migration once via the Supabase SQL editor or CLI (it is idempotent).

---

## Project Structure

```
app/
  (dashboard)/         # Authenticated route group
    dashboard/         # API config list + stats
    apis/[id]/         # Call + history pages
    settings/          # Profile, API key, platform key
  api/
    auth/              # signup, login, refresh, logout, me
    apis/              # CRUD + call + history
    gemma/models/      # Model listing
    user/              # Profile, passwords, keys
    v1/[id]/call/      # Public REST endpoint
lib/
  auth.ts              # JWT helpers + getAuthPayload()
  encrypt.ts           # AES-256-GCM key encryption
  googleAI.ts          # Gemma wrapper + model cache
  sheets.ts            # Supabase data layer (named "sheets" for legacy reasons)
  types.ts             # Shared TypeScript types
  validate.ts          # Zod schemas
supabase/
  migrations/          # SQL schema
tests/                 # Jest test suite
```
