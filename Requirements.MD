# Project Requirements: Gemma API Management Platform

**Version:** 2.0  
**Last Updated:** 2026-04-26  
**Deployment Target:** Vercel  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Goals & Objectives](#2-goals--objectives)
3. [User Stories](#3-user-stories)
4. [Technology Stack](#4-technology-stack)
5. [Data Models](#5-data-models)
6. [Backend — API Specification](#6-backend--api-specification)
7. [Google API Key Management & Tiers](#7-google-api-key-management--tiers)
8. [Authentication & Security](#8-authentication--security)
9. [Google Sheets Storage via Apps Script](#9-google-sheets-storage-via-apps-script)
10. [Frontend — Pages & UI Specification](#10-frontend--pages--ui-specification)
11. [Error Handling](#11-error-handling)
12. [Environment Variables](#12-environment-variables)
13. [Project Structure](#13-project-structure)
14. [Test Requirements](#14-test-requirements)
15. [Deployment Requirements](#15-deployment-requirements)
16. [Documentation Requirements](#16-documentation-requirements)
17. [Known Constraints & Limitations](#17-known-constraints--limitations)
18. [Out of Scope (V2.0)](#18-out-of-scope-v20)
19. [Acceptance Criteria](#19-acceptance-criteria)

---

## 1. Project Overview

A full-stack web platform that lets registered users create, configure, and call multiple Gemma AI API configurations through a browser UI. Each saved API configuration is a named, reusable set of Gemma model parameters that the user can invoke directly from the platform with a prompt.

By default, the platform uses the owner's shared Google API key (subject to per-user daily quotas). Users who supply their own Google API key are promoted to an unrestricted tier, bypassing shared-key quotas entirely.

User account data, saved API configurations, encrypted user API keys, and call logs are all persisted in Google Sheets via a Google Apps Script Web App acting as an HTTPS data layer.

---

## 2. Goals & Objectives

- Allow users to sign up, log in, and manage their account via a browser UI
- Allow users to create and manage multiple named Gemma API configurations (model, generation parameters, safety settings)
- Allow users to invoke any saved API configuration from the UI by entering a prompt and viewing the response
- Support a two-tier Google API key system: shared key with quotas (default) vs. user-supplied key (unrestricted)
- Encrypt user-supplied Google API keys at rest in Google Sheets using AES-256-GCM
- Track API call usage per user and per saved API configuration, with paginated call history
- Provide a test suite that verifies all backend endpoints independently of the frontend
- Deploy both frontend and backend as a single Vercel project

---

## 3. User Stories

| ID | As a... | I want to... | So that... |
|---|---|---|---|
| US-01 | Visitor | Sign up for an account | I can access the platform |
| US-02 | User | Log in and stay logged in for a reasonable session | I don't have to re-authenticate every hour |
| US-03 | User | Create a new API configuration with a name, model, and parameters | I can reuse it without reconfiguring each time |
| US-04 | User | List all my saved API configurations | I can see what I've created at a glance |
| US-05 | User | Edit an existing API configuration | I can tune it without creating a duplicate |
| US-06 | User | Delete an API configuration | I can clean up configurations I no longer need |
| US-07 | User | Call a saved API configuration by entering a prompt | I can get a response from Gemma instantly |
| US-08 | User | View the response from a Gemma call in the UI | I can read and copy the output |
| US-09 | User | See my call history for each API configuration | I can review past prompts and responses |
| US-10 | User | See my current quota usage | I know how close I am to the shared-key limit |
| US-11 | User | Add my own Google API key | I can bypass shared-key limits |
| US-12 | User | Remove my Google API key | I can revert to the shared key |
| US-13 | User | Know which tier I am on | I understand my current limitations |

---

## 4. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Node.js 20+ | Vercel serverless functions |
| Backend Framework | Next.js 14 (App Router) | API routes under `/app/api/` |
| Frontend Framework | Next.js 14 (App Router) | React server + client components |
| Language | TypeScript | Strict mode |
| AI Backend | Google Generative AI SDK (`@google/generative-ai`) | Gemma model family |
| Auth | JWT access token + httpOnly cookie refresh token | See Section 8 |
| Password Hashing | bcrypt (cost factor 12) | |
| API Key Encryption | AES-256-GCM via Node.js `crypto` module | Encryption key held in env var |
| User Store | Google Sheets via Apps Script Web App | See Section 9 |
| Styling | Tailwind CSS | |
| Client State | Zustand | Access token + user profile |
| Validation | Zod | All request bodies and env vars |
| Testing | Jest + Supertest | Unit + integration |
| Deployment | Vercel | Single project, frontend + backend |

---

## 5. Data Models

### 5.1 User

Stored in Google Sheet: **`Users`**

| Column | Field | Type | Description |
|---|---|---|---|
| A | `id` | string (UUID v4) | Primary key |
| B | `email` | string | Unique, used for login lookup |
| C | `name` | string | Display name |
| D | `passwordHash` | string | bcrypt hash, cost factor 12 |
| E | `createdAt` | ISO 8601 string | Account creation timestamp |
| F | `lastLoginAt` | ISO 8601 string | Last successful login |
| G | `isActive` | boolean | Soft-delete flag |
| H | `tier` | `"shared"` \| `"byok"` | API key tier |
| I | `totalCallCount` | integer | Cumulative calls across all APIs |
| J | `dailyCallCount` | integer | Calls made on current UTC day |
| K | `dailyCallResetAt` | ISO 8601 string | Date of last daily counter reset |
| L | `refreshToken` | string | UUID v4 refresh token |
| M | `refreshTokenExpiresAt` | ISO 8601 string | Refresh token expiry |

### 5.2 UserApiKey

Stored in Google Sheet: **`UserApiKeys`**

One row per user maximum. Adding a new key overwrites the existing row.

| Column | Field | Type | Description |
|---|---|---|---|
| A | `userId` | string (UUID v4) | Foreign key → `Users.id` |
| B | `encryptedKey` | string | AES-256-GCM encrypted Google API key (base64) |
| C | `iv` | string | AES initialisation vector (base64), unique per encryption |
| D | `keyHint` | string | Last 4 characters of the plaintext key, for UI display only |
| E | `createdAt` | ISO 8601 string | When the key was saved |
| F | `isValid` | boolean | Whether the key passed validation at save time |

### 5.3 SavedApi

Stored in Google Sheet: **`SavedApis`**

| Column | Field | Type | Description |
|---|---|---|---|
| A | `id` | string (UUID v4) | Primary key |
| B | `userId` | string (UUID v4) | Foreign key → `Users.id` |
| C | `name` | string | User-defined name (e.g. "My Summariser") |
| D | `description` | string | Optional user-defined description |
| E | `model` | string | Gemma model ID (e.g. `gemma-3-27b-it`) |
| F | `temperature` | float \| empty | 0–2; empty = model default |
| G | `topP` | float \| empty | 0–1; empty = model default |
| H | `topK` | integer \| empty | empty = model default |
| I | `maxOutputTokens` | integer \| empty | empty = model default |
| J | `stopSequences` | JSON string | Serialised string array |
| K | `safetySettings` | JSON string | Serialised safety settings array |
| L | `systemPrompt` | string | Optional system-level instruction prepended to every call |
| M | `callCount` | integer | Total calls made using this configuration |
| N | `createdAt` | ISO 8601 string | |
| O | `updatedAt` | ISO 8601 string | |

### 5.4 CallLog

Stored in Google Sheet: **`CallLogs`**

| Column | Field | Type | Description |
|---|---|---|---|
| A | `id` | string (UUID v4) | Primary key |
| B | `savedApiId` | string (UUID v4) | Foreign key → `SavedApis.id` |
| C | `userId` | string (UUID v4) | Foreign key → `Users.id` |
| D | `prompt` | string | Input prompt (truncated to 2000 chars for storage) |
| E | `responseText` | string | Model response (truncated to 4000 chars for storage) |
| F | `model` | string | Model used (snapshot at call time) |
| G | `promptTokenCount` | integer | |
| H | `responseTokenCount` | integer | |
| I | `totalTokenCount` | integer | |
| J | `finishReason` | string | e.g. `STOP`, `MAX_TOKENS`, `SAFETY` |
| K | `tier` | `"shared"` \| `"byok"` | Which key tier was used |
| L | `latencyMs` | integer | End-to-end response time in milliseconds |
| M | `createdAt` | ISO 8601 string | Call timestamp |

---

## 6. Backend — API Specification

All endpoints return `Content-Type: application/json`. Protected endpoints require a valid JWT access token in the `Authorization: Bearer <token>` header.

---

### 6.1 Auth Endpoints

#### `POST /api/auth/signup`

Registers a new user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "StrongPass1!",
  "name": "Jane Doe"
}
```

**Validation:**
- `email`: valid RFC 5322 format, must be unique
- `password`: min 8 chars, at least one uppercase letter, one digit, one special character
- `name`: 2–100 chars, required

**On success:** `201 Created`
```json
{
  "accessToken": "<jwt>",
  "user": { "id": "...", "email": "...", "name": "...", "tier": "shared" }
}
```

Sets a `refreshToken` httpOnly cookie (7-day expiry). Creates initial `Users` row with `tier = "shared"`.

---

#### `POST /api/auth/login`

**Request:**
```json
{ "email": "user@example.com", "password": "StrongPass1!" }
```

**On success:** `200 OK` — same shape as signup response. Sets `refreshToken` httpOnly cookie.

---

#### `POST /api/auth/refresh`

Reads the `refreshToken` httpOnly cookie, validates it against the stored token in the `Users` sheet, issues a new access token and rotates the refresh token.

**On success:** `200 OK`
```json
{ "accessToken": "<new_jwt>" }
```

Sets a new `refreshToken` httpOnly cookie. On failure: `401 REFRESH_TOKEN_INVALID`.

---

#### `POST /api/auth/logout`

Clears the `refreshToken` cookie and invalidates the stored refresh token in the sheet. Always returns `200 OK`.

---

#### `GET /api/auth/me`

Returns the authenticated user's profile including tier and quota status.

**On success:** `200 OK`
```json
{
  "id": "...",
  "email": "...",
  "name": "...",
  "tier": "shared",
  "totalCallCount": 142,
  "dailyCallCount": 12,
  "dailyLimit": 50,
  "dailyRemaining": 38,
  "hasApiKey": false,
  "keyHint": null
}
```

---

### 6.2 Saved API Endpoints

All require authentication.

#### `POST /api/apis` — Create

**Request:**
```json
{
  "name": "My Summariser",
  "description": "Summarises long articles into bullet points.",
  "model": "gemma-3-27b-it",
  "temperature": 0.5,
  "topP": 0.9,
  "topK": null,
  "maxOutputTokens": 512,
  "stopSequences": [],
  "safetySettings": [],
  "systemPrompt": "You are a concise summarisation assistant."
}
```

**Validation:**
- `name`: 1–100 chars, required
- `model`: must match a valid Gemma model ID from `GET /api/gemma/models`
- `temperature`: 0–2 or null
- `topP`: 0–1 or null
- `topK`: positive integer or null
- `maxOutputTokens`: 1–8192 or null

**On success:** `201 Created` with the full `SavedApi` object. Maximum **20 saved APIs per user** — returns `429 API_LIMIT_REACHED` if exceeded.

---

#### `GET /api/apis` — List

Returns all saved API configurations for the authenticated user (summary fields only).

**Response:**
```json
{
  "apis": [
    {
      "id": "...",
      "name": "My Summariser",
      "model": "gemma-3-27b-it",
      "description": "Summarises long articles...",
      "callCount": 34,
      "createdAt": "2026-04-01T00:00:00Z",
      "updatedAt": "2026-04-20T08:00:00Z"
    }
  ],
  "total": 1
}
```

---

#### `GET /api/apis/:id` — Get One

Returns the full configuration of a single saved API. Returns `403` if the API does not belong to the authenticated user.

---

#### `PUT /api/apis/:id` — Update

Accepts any subset of the fields from `POST /api/apis`. Returns `200 OK` with the full updated object.

---

#### `DELETE /api/apis/:id` — Delete

Deletes a saved API and all its associated call logs. Returns `204 No Content`.

---

### 6.3 API Execution Endpoint

#### `POST /api/apis/:id/call`

Invokes the saved API configuration with a prompt.

**Request:**
```json
{
  "prompt": "Summarise the following article: ...",
  "overrides": {
    "temperature": 0.8,
    "maxOutputTokens": 256
  }
}
```

- `prompt`: required, max 32,000 chars
- `overrides`: optional — any generation config field that overrides the saved config for this call only

**Execution flow:**
1. Load saved API config by `id`, verify ownership
2. Resolve which Google API key to use:
   - **Shared tier:** verify `dailyCallCount` < `dailyLimit`. If exceeded → `429 QUOTA_EXCEEDED`
   - **BYOK tier:** decrypt user's Google API key from sheet; use it directly. No quota check.
3. Build generation request (systemPrompt + saved config merged with overrides)
4. Call Google Generative AI API, measure latency
5. Write `CallLog` row to sheet
6. Increment `SavedApis.callCount`, `Users.totalCallCount`, `Users.dailyCallCount`
7. Return response

**On success:** `200 OK`
```json
{
  "text": "Here are the key points: ...",
  "model": "gemma-3-27b-it",
  "finishReason": "STOP",
  "usage": {
    "promptTokenCount": 312,
    "responseTokenCount": 118,
    "totalTokenCount": 430
  },
  "latencyMs": 1240,
  "callLogId": "..."
}
```

---

### 6.4 Call History Endpoint

#### `GET /api/apis/:id/calls`

Returns paginated call history for a saved API. Returns `403` if the API does not belong to the authenticated user.

**Query params:** `?page=1&limit=20` (max limit: 50)

**Response:**
```json
{
  "calls": [
    {
      "id": "...",
      "prompt": "Summarise the following...",
      "responseText": "Key points: ...",
      "model": "gemma-3-27b-it",
      "totalTokenCount": 430,
      "finishReason": "STOP",
      "tier": "shared",
      "latencyMs": 1240,
      "createdAt": "2026-04-26T09:12:00Z"
    }
  ],
  "total": 34,
  "page": 1,
  "limit": 20
}
```

---

### 6.5 Google API Key Endpoints

All require authentication.

#### `POST /api/user/apikey` — Add / Replace Key

**Request:**
```json
{ "apiKey": "AIza..." }
```

**Behaviour:**
1. Call `listModels()` on the Google Generative AI SDK using the provided key to validate it
2. If invalid → `400 INVALID_API_KEY`
3. Encrypt key using AES-256-GCM with `ENCRYPTION_SECRET`
4. Write/overwrite `UserApiKeys` row in the sheet
5. Update `Users.tier` to `"byok"`

**On success:** `200 OK`
```json
{ "keyHint": "a3Xz", "tier": "byok", "isValid": true }
```

---

#### `DELETE /api/user/apikey` — Remove Key

Deletes the `UserApiKeys` row and sets `Users.tier` back to `"shared"`.

**On success:** `200 OK`
```json
{ "tier": "shared" }
```

---

### 6.6 Gemma Models Endpoint

#### `GET /api/gemma/models`

Returns the list of available Gemma models from the Google Generative AI API. Uses the shared key. Response is cached for 1 hour (Vercel edge cache or in-memory).

**Response:**
```json
{
  "models": [
    {
      "id": "gemma-3-27b-it",
      "displayName": "Gemma 3 27B Instruct",
      "inputTokenLimit": 8192,
      "outputTokenLimit": 8192
    }
  ]
}
```

---

## 7. Google API Key Management & Tiers

### 7.1 Tier Definitions

| Tier | Key Used | Daily Call Limit | Max Output Tokens per Call |
|---|---|---|---|
| `shared` | Platform owner's `GOOGLE_API_KEY` env var | `SHARED_TIER_DAILY_LIMIT` (default: 50) | 4096 |
| `byok` | User's own decrypted key | No platform limit | No platform limit |

### 7.2 Daily Quota Reset

The `dailyCallCount` is reset lazily — when the first call of a new calendar day (UTC) is made, the server detects that `dailyCallResetAt` is from a previous date, resets `dailyCallCount` to 0, and updates `dailyCallResetAt`. No scheduled cron is required.

### 7.3 Key Encryption

- Algorithm: **AES-256-GCM**
- Key source: `ENCRYPTION_SECRET` env var (must be exactly 32 bytes, base64-encoded, generated securely)
- A fresh random 12-byte IV is generated for every encryption operation
- Both `encryptedKey` (base64) and `iv` (base64) are stored in the `UserApiKeys` sheet row
- Decryption happens inside the Vercel serverless function immediately before the API call; the plaintext key is never logged or written anywhere
- The `ENCRYPTION_SECRET` must be treated as critical infrastructure — rotating it requires re-encrypting all stored keys

### 7.4 Key Validation

When a user submits a new key, the platform calls `listModels()` using that key. If the call fails for any reason (invalid key, quota exceeded, billing not enabled), the key is rejected with a descriptive error and is never stored.

---

## 8. Authentication & Security

### 8.1 JWT Access Token

- Algorithm: HS256, signed with `JWT_SECRET`
- Payload: `{ sub: userId, email, tier, iat, exp }`
- Expiry: **15 minutes**
- Delivered in the response body; stored in memory on the client (Zustand store)
- Never stored in localStorage or sessionStorage

### 8.2 Refresh Token

- Stored as an **httpOnly, Secure, SameSite=Strict** cookie named `refreshToken`
- Expiry: **7 days**
- Value: UUID v4, stored in the `Users` sheet alongside its expiry
- Rotation: a new refresh token is issued and the old one invalidated on every `/api/auth/refresh` call
- Invalidated on logout via `POST /api/auth/logout`

### 8.3 Client-Side Auth Flow

1. On page load, the frontend calls `POST /api/auth/refresh` silently using the httpOnly cookie
2. If the refresh succeeds, the new access token is stored in Zustand memory
3. If the refresh fails (expired or missing cookie), the user is redirected to `/login`
4. A `setTimeout` fires 1 minute before the access token's `exp` claim to trigger a silent background refresh
5. All API calls use the in-memory access token from the Zustand store

### 8.4 Rate Limiting

- `/api/apis/:id/call`: quota enforced per-user by tier (Section 7.1)
- All other API routes: **100 requests per 15 minutes per IP**, enforced via Vercel KV (in-memory fallback for development)
- Exceeded limits return `429` with a `Retry-After` header

### 8.5 Input Sanitisation

- All user-supplied strings trimmed and sanitised before storage or forwarding
- Prompt length hard cap: **32,000 characters**
- All request bodies validated against strict Zod schemas

### 8.6 CORS

- Requests accepted only from `NEXT_PUBLIC_APP_URL` origin
- Credentials (cookies) are allowed only from the whitelisted origin
- All other origins receive `403` on non-GET requests

---

## 9. Google Sheets Storage via Apps Script

### 9.1 Architecture

All data is stored in a single Google Sheets workbook with four named sheets. A Google Apps Script is published as a Web App (HTTPS) and handles all reads and writes. Vercel functions communicate with this endpoint via HTTPS POST authenticated with a shared secret header (`X-Sheets-Secret`).

The workbook is **not publicly accessible**. Only the Apps Script Web App URL is exposed, and only to Vercel functions holding the `SHEETS_SECRET` env var.

### 9.2 Apps Script Action Contract

All actions are dispatched via `POST` with `{ action, ...payload }` in the JSON body.

**Users sheet actions**

| Action | Key Payload Fields | Response |
|---|---|---|
| `createUser` | `id, email, name, passwordHash, createdAt` | `{ success, id }` |
| `getUserByEmail` | `email` | `{ success, user }` |
| `getUserById` | `id` | `{ success, user }` |
| `updateLastLogin` | `id, lastLoginAt` | `{ success }` |
| `setRefreshToken` | `id, refreshToken, refreshTokenExpiresAt` | `{ success }` |
| `getRefreshToken` | `id` | `{ success, refreshToken, refreshTokenExpiresAt }` |
| `clearRefreshToken` | `id` | `{ success }` |
| `updateTier` | `id, tier` | `{ success }` |
| `incrementCallCounts` | `id, currentDate` | `{ success }` — resets `dailyCallCount` if new UTC day, then increments both counters |
| `getUserQuota` | `id` | `{ success, dailyCallCount, dailyCallResetAt, totalCallCount, tier }` |

**UserApiKeys sheet actions**

| Action | Key Payload Fields | Response |
|---|---|---|
| `setApiKey` | `userId, encryptedKey, iv, keyHint, createdAt, isValid` | `{ success }` |
| `getApiKey` | `userId` | `{ success, encryptedKey, iv, keyHint, isValid }` or `{ success: false }` |
| `deleteApiKey` | `userId` | `{ success }` |

**SavedApis sheet actions**

| Action | Key Payload Fields | Response |
|---|---|---|
| `createSavedApi` | full `SavedApi` object | `{ success, id }` |
| `getSavedApisByUser` | `userId` | `{ success, apis: [...] }` |
| `getSavedApiById` | `id` | `{ success, api }` or `{ success: false }` |
| `updateSavedApi` | `id, ...fields` | `{ success }` |
| `deleteSavedApi` | `id` | `{ success }` |
| `incrementApiCallCount` | `id` | `{ success }` |

**CallLogs sheet actions**

| Action | Key Payload Fields | Response |
|---|---|---|
| `createCallLog` | full `CallLog` object | `{ success, id }` |
| `getCallLogsByApi` | `savedApiId, page, limit` | `{ success, calls: [...], total }` |
| `deleteCallLogsByApi` | `savedApiId` | `{ success }` — called when a SavedApi is deleted |

### 9.3 Scalability Note

Google Sheets is appropriate for early-stage use (up to ~500 users, ~50,000 call log rows). The `CallLogs` sheet will grow fastest. As the platform scales, migrating `CallLogs` and then `SavedApis` to a relational database (Vercel Postgres / Neon / Supabase) is recommended. The `lib/sheets.ts` abstraction layer isolates this migration to a single file — the API route code does not need to change.

---

## 10. Frontend — Pages & UI Specification

The frontend is a Next.js 14 App Router application. All routes under `/dashboard` require authentication; unauthenticated visitors are redirected to `/login` via a server-side auth guard in the dashboard layout.

### 10.1 Page Map

| Route | Page | Auth Required |
|---|---|---|
| `/` | Landing page | No |
| `/login` | Login form | No |
| `/signup` | Sign-up form | No |
| `/dashboard` | Dashboard — API list + usage overview | Yes |
| `/dashboard/apis/new` | Create API configuration | Yes |
| `/dashboard/apis/:id` | View & call a saved API | Yes |
| `/dashboard/apis/:id/edit` | Edit API configuration | Yes |
| `/dashboard/apis/:id/history` | Call history for a saved API | Yes |
| `/dashboard/settings` | Account settings + API key management | Yes |

### 10.2 Page Specifications

#### Landing Page (`/`)

- Brief product description and feature highlights (what the platform does, the two tiers)
- "Sign Up" and "Log In" CTA buttons

#### Login (`/login`)

- Email and password fields
- "Log in" submit button; link to `/signup`
- On success: redirect to `/dashboard`
- On failure: inline error message (no page reload)

#### Sign Up (`/signup`)

- Name, email, password, confirm password fields
- Password strength indicator
- On success: redirect to `/dashboard`
- On failure: inline field-level validation errors

#### Dashboard (`/dashboard`)

- **Quota / tier banner:** for shared-tier users, shows "X / 50 calls used today" with a progress bar. For BYOK users, shows "Unlimited (your own key)"
- **API configuration grid:** card for each saved API showing name, model, call count, last updated. Each card links to `/dashboard/apis/:id`
- **"New API" button:** links to `/dashboard/apis/new`. Hidden/disabled with tooltip if user is at the 20-API limit
- Empty state illustration when no APIs exist yet

#### Create / Edit API Configuration

Used for both `/dashboard/apis/new` and `/dashboard/apis/:id/edit` (pre-populated on edit).

Form fields:

| Field | Input Type | Notes |
|---|---|---|
| Name | Text | Required, 1–100 chars |
| Description | Textarea | Optional |
| Model | Dropdown | Populated from `GET /api/gemma/models` |
| System Prompt | Textarea | Optional; tooltip explaining its effect |
| Temperature | Slider 0–2 + numeric input | Optional; null = model default |
| Top P | Slider 0–1 + numeric input | Optional |
| Top K | Numeric input | Optional |
| Max Output Tokens | Numeric input | Optional; capped at 4096 for shared tier |
| Stop Sequences | Tag input | Optional; add/remove strings |
| Safety Settings | Per-category dropdowns | Optional; one dropdown per harm category |

"Save" button → `POST /api/apis` or `PUT /api/apis/:id`. On success: redirect to `/dashboard/apis/:id`.

#### API Call Page (`/dashboard/apis/:id`)

- **Config summary panel (left/top):** name, model, key parameters read-only. "Edit" and "Delete" buttons
- **Call panel (main area):**
  - Prompt textarea (required)
  - Collapsible "Override parameters" section: temperature, maxOutputTokens
  - "Call API" button with loading spinner while awaiting response
  - Response display area: model output text (formatted), token usage (prompt / response / total), latency, finish reason
  - "Copy response" button
- **Quota warning banner:** shown when shared-tier user has ≤ 10 calls remaining today
- **Recent calls (bottom):** last 5 call log entries (prompt preview, response preview, timestamp). "View all history" link → `/dashboard/apis/:id/history`

#### Call History (`/dashboard/apis/:id/history`)

- Paginated table of call logs, 20 per page
- Columns: timestamp, prompt preview, response preview, tokens, latency, tier, finish reason
- Click a row → full prompt and full response in a slide-over panel

#### Settings (`/dashboard/settings`)

**Account section:**
- Display name (editable, inline save)
- Email (read-only)
- Change password form (current password + new password + confirm)

**Google API Key section:**
- Current status: "Using shared key (50 calls/day)" or "Using your own key (ending in `keyHint`)"
- **Add / Replace Key:** text input + "Save Key" button. Shows spinner during validation. Displays a validation result message (success or error reason)
- **Remove Key:** button visible only if a BYOK key is active. Requires a confirmation dialog before removal
- Info callout: explains the two tiers and links to the Google Cloud Console for obtaining an API key

### 10.3 Global UI Components

- **Navbar:** logo, Dashboard link, Settings link, user avatar dropdown (shows name, email, logout option)
- **Toast notifications:** top-right success/error toasts for all mutating actions
- **Loading skeletons:** for dashboard API grid, call history table, settings data fetches
- **Error boundary:** catches unexpected render errors, shows a generic fallback with a retry button
- **Auth guard:** server-side redirect in `/dashboard/layout.tsx` for unauthenticated requests

---

## 11. Error Handling

All API errors return a consistent JSON envelope:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description.",
    "details": {}
  }
}
```

### Error Code Reference

| HTTP Status | Code | Scenario |
|---|---|---|
| 400 | `INVALID_REQUEST` | Missing or malformed request body |
| 400 | `VALIDATION_ERROR` | Field-level validation failure |
| 400 | `INVALID_API_KEY` | User-supplied Google API key failed validation |
| 401 | `UNAUTHORIZED` | Missing, invalid, or expired JWT |
| 401 | `REFRESH_TOKEN_INVALID` | Refresh token missing, expired, or already rotated |
| 403 | `FORBIDDEN` | Valid token but resource does not belong to this user |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Duplicate resource (e.g. email already registered) |
| 429 | `RATE_LIMIT_EXCEEDED` | IP-level rate limit hit |
| 429 | `QUOTA_EXCEEDED` | Shared-tier daily call quota exhausted |
| 429 | `API_LIMIT_REACHED` | User already has 20 saved APIs |
| 500 | `INTERNAL_ERROR` | Unhandled server error |
| 502 | `UPSTREAM_ERROR` | Google Generative AI API returned an error |
| 503 | `SHEETS_UNAVAILABLE` | Apps Script Web App did not respond in time |

---

## 12. Environment Variables

All secrets are managed as Vercel environment variables. A `.env.example` is committed to the repository.

| Variable | Description |
|---|---|
| `GOOGLE_API_KEY` | Platform owner's Google Generative AI API key (shared tier) |
| `JWT_SECRET` | HS256 signing secret, minimum 32 random characters |
| `ENCRYPTION_SECRET` | AES-256 encryption key for user API keys, exactly 32 bytes, base64-encoded |
| `SHEETS_WEBHOOK_URL` | Published Google Apps Script Web App URL |
| `SHEETS_SECRET` | Shared secret validated by the Apps Script (`X-Sheets-Secret` header) |
| `SHARED_TIER_DAILY_LIMIT` | Daily call limit for shared-tier users (default: `50`) |
| `NEXT_PUBLIC_APP_URL` | Public URL of the deployed frontend (used for CORS) |
| `NODE_ENV` | `development` / `production` |

---

## 13. Project Structure

```
gemma-platform/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx                  # Auth guard + navbar
│   │   ├── dashboard/page.tsx
│   │   ├── dashboard/apis/
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx            # Call page
│   │   │       ├── edit/page.tsx
│   │   │       └── history/page.tsx
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   ├── signup/route.ts
│   │   │   ├── login/route.ts
│   │   │   ├── logout/route.ts
│   │   │   ├── refresh/route.ts
│   │   │   └── me/route.ts
│   │   ├── apis/
│   │   │   ├── route.ts                # GET (list) + POST (create)
│   │   │   └── [id]/
│   │   │       ├── route.ts            # GET + PUT + DELETE
│   │   │       ├── call/route.ts       # POST
│   │   │       └── calls/route.ts      # GET (history)
│   │   ├── user/
│   │   │   └── apikey/route.ts         # POST + DELETE
│   │   └── gemma/
│   │       └── models/route.ts         # GET
├── components/
│   ├── ui/                             # Base components (Button, Input, Modal, Toast, Skeleton)
│   ├── ApiCard.tsx
│   ├── ApiConfigForm.tsx
│   ├── CallPanel.tsx
│   ├── CallHistoryTable.tsx
│   ├── QuotaBanner.tsx
│   ├── ApiKeyManager.tsx
│   └── Navbar.tsx
├── lib/
│   ├── googleAI.ts                     # Google Generative AI SDK wrapper
│   ├── auth.ts                         # JWT sign/verify, cookie helpers
│   ├── sheets.ts                       # Apps Script HTTP client
│   ├── encrypt.ts                      # AES-256-GCM encrypt/decrypt
│   ├── rateLimit.ts                    # IP rate limiter (Vercel KV / in-memory)
│   └── validate.ts                     # Zod schemas for all request bodies
├── store/
│   └── authStore.ts                    # Zustand: access token, user profile, refresh logic
├── tests/
│   ├── auth.test.ts
│   ├── apis.crud.test.ts
│   ├── apis.call.test.ts
│   ├── apis.history.test.ts
│   ├── user.apikey.test.ts
│   ├── quota.test.ts
│   ├── encrypt.test.ts
│   └── sheets.integration.test.ts
├── apps-script/
│   └── Code.gs                         # Google Apps Script source
├── .env.example
├── jest.config.ts
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vercel.json
└── README.md
```

---

## 14. Test Requirements

All unit tests run with `npm test`. Integration tests run with `npm run test:integration` against a dedicated staging Google Sheet.

### 14.1 Auth Tests (`tests/auth.test.ts`)

| Test Case | Expected |
|---|---|
| Signup with valid data | `201`, access token returned, cookie set |
| Signup with duplicate email | `409 CONFLICT` |
| Signup with weak password | `400 VALIDATION_ERROR` |
| Login with correct credentials | `200`, access token returned, cookie set |
| Login with wrong password | `401 UNAUTHORIZED` |
| `GET /api/auth/me` with valid token | `200`, profile with quota fields |
| `GET /api/auth/me` with expired token | `401 UNAUTHORIZED` |
| `POST /api/auth/refresh` with valid cookie | `200`, new access token, cookie rotated |
| `POST /api/auth/refresh` with expired cookie | `401 REFRESH_TOKEN_INVALID` |
| `POST /api/auth/logout` | `200`, cookie cleared |

### 14.2 Saved API CRUD Tests (`tests/apis.crud.test.ts`)

| Test Case | Expected |
|---|---|
| Create API with valid config | `201`, full `SavedApi` object returned |
| Create API with invalid model ID | `400 VALIDATION_ERROR` |
| Create API with temperature > 2 | `400 VALIDATION_ERROR` |
| Create 21st API (at limit) | `429 API_LIMIT_REACHED` |
| List APIs returns only requesting user's APIs | `200`, correct list |
| Get API by ID (owner) | `200`, full config |
| Get API by ID (different user's API) | `403 FORBIDDEN` |
| Update API name | `200`, updated object |
| Delete API | `204 No Content` |
| Get deleted API | `404 NOT_FOUND` |

### 14.3 API Call Tests (`tests/apis.call.test.ts`)

| Test Case | Expected |
|---|---|
| Call API (shared tier, within quota) | `200`, response with text and usage |
| Call API with parameter override | `200`, override applied to generation config |
| Call API (shared tier, quota exhausted) | `429 QUOTA_EXCEEDED` |
| Call API (BYOK tier, any call count) | `200`, no quota check applied |
| Call API without auth token | `401 UNAUTHORIZED` |
| Call API belonging to another user | `403 FORBIDDEN` |
| Call API with prompt > 32,000 chars | `400 VALIDATION_ERROR` |
| Successful call creates a `CallLog` row | Log row exists in mock sheets store |
| Successful call increments `callCount` on `SavedApi` | Count incremented in mock |
| Successful call increments user daily + total counts | Counts incremented in mock |

### 14.4 Call History Tests (`tests/apis.history.test.ts`)

| Test Case | Expected |
|---|---|
| Get call history for own API | `200`, paginated list with correct fields |
| Get call history for another user's API | `403 FORBIDDEN` |
| Pagination: `page=2` returns correct offset | `200`, correct slice of results |
| `limit` param above max (50) is capped | Response uses 50 as limit |

### 14.5 API Key Tests (`tests/user.apikey.test.ts`)

| Test Case | Expected |
|---|---|
| Add valid Google API key | `200`, tier = `byok`, keyHint returned |
| Add invalid Google API key | `400 INVALID_API_KEY` |
| Add key when one exists (overwrites) | `200`, new keyHint returned |
| Remove key when key exists | `200`, tier = `shared` |
| Remove key when none exists | `404 NOT_FOUND` |

### 14.6 Quota Tests (`tests/quota.test.ts`)

| Test Case | Expected |
|---|---|
| Shared-tier user at 0 calls: call succeeds | `200` |
| Shared-tier user at limit: call blocked | `429 QUOTA_EXCEEDED` |
| First call on new UTC day resets counter | Counter resets to 1, call succeeds |
| BYOK-tier user is never quota-blocked | `200` regardless of call count |

### 14.7 Encryption Tests (`tests/encrypt.test.ts`)

| Test Case | Expected |
|---|---|
| Encrypt then decrypt returns original plaintext | Strings match exactly |
| Two encryptions of same string produce different ciphertext | IVs are unique |
| Decryption with wrong `ENCRYPTION_SECRET` throws | Error thrown |
| Decryption with tampered ciphertext throws | Error thrown (GCM auth tag fails) |

### 14.8 Sheets Integration Tests (`tests/sheets.integration.test.ts`)

Run against a staging sheet. Isolated from production data.

| Test Case | Expected |
|---|---|
| `createUser` + `getUserByEmail` round-trip | Returned user matches input |
| `setApiKey` + `getApiKey` round-trip | Encrypted data returned correctly |
| `deleteApiKey` + `getApiKey` returns failure | `{ success: false }` |
| `createSavedApi` + `getSavedApiById` round-trip | Returned API matches input |
| `deleteSavedApi` + `getSavedApiById` returns failure | `{ success: false }` |
| `createCallLog` + `getCallLogsByApi` round-trip | Log appears in results |
| `deleteCallLogsByApi` removes all logs for API | Subsequent query returns empty list |
| `incrementApiCallCount` increments field | `callCount` increases by 1 |
| `incrementCallCounts` on same day increments both | `dailyCallCount` and `totalCallCount` increase |
| `incrementCallCounts` on new UTC day resets daily | `dailyCallCount` resets to 1 |

### 14.9 Test Setup Notes

- All unit tests mock `lib/sheets.ts`, `lib/googleAI.ts`, and `lib/encrypt.ts` via `tests/mocks/`
- `.env.test` holds local test credentials; CI uses Vercel environment secrets
- The Google AI SDK mock simulates both successful responses and upstream error scenarios
- Integration tests require `SHEETS_WEBHOOK_URL`, `SHEETS_SECRET`, and a separate staging workbook

---

## 15. Deployment Requirements

### 15.1 Vercel Configuration (`vercel.json`)

```json
{
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 30
    }
  }
}
```

### 15.2 Deployment Checklist

- [ ] All environment variables configured in Vercel dashboard (Production + Preview)
- [ ] `ENCRYPTION_SECRET` is exactly 32 bytes, generated with a cryptographically secure RNG, base64-encoded
- [ ] `JWT_SECRET` is at least 32 random characters
- [ ] Google Sheets workbook created with four sheets: `Users`, `UserApiKeys`, `SavedApis`, `CallLogs`
- [ ] Column headers added to each sheet matching the schemas in Section 5
- [ ] Google Apps Script (`Code.gs`) deployed and published as a Web App; URL copied to `SHEETS_WEBHOOK_URL`
- [ ] `GOOGLE_API_KEY` has Generative AI API access enabled in Google Cloud Console
- [ ] `NEXT_PUBLIC_APP_URL` set to the production Vercel domain
- [ ] All unit tests passing (`npm test`) before merging to `main`
- [ ] GitHub integration configured; Vercel auto-deploys on push to `main`

---

## 16. Documentation Requirements

The repository `README.md` must cover:

- Architecture overview: how the frontend, Next.js API routes, Apps Script, and Google AI API relate to each other
- Local development: `npm install`, `.env` setup, `npm run dev`
- Google Sheets setup: workbook creation, four sheet names, column headers for all sheets
- Apps Script setup: how to deploy `Code.gs`, publish as Web App, copy the URL
- Two-tier key system: explanation of shared vs. BYOK tier, how to obtain a Google API key
- Full API reference: all endpoints, request/response schemas, error codes
- Running tests: `npm test` and `npm run test:integration`
- Deployment to Vercel: step-by-step including env var configuration

---

## 17. Known Constraints & Limitations

| Constraint | Detail |
|---|---|
| Sheets write latency | Apps Script writes take 1–3 seconds, adding overhead to every API call |
| Sheets row limit | ~10M cells per workbook; `CallLogs` will grow fastest and should be monitored |
| Apps Script execution timeout | 30s maximum; large `getCallLogsByApi` queries on big sheets may time out |
| Concurrent write races | Sheets has no row-level locking; concurrent `incrementCallCounts` calls carry a small race risk |
| API key security | User keys are encrypted at rest but briefly in plaintext in server memory; the `ENCRYPTION_SECRET` is critical infrastructure |
| `ENCRYPTION_SECRET` rotation | Rotating the encryption secret requires re-encrypting all existing user keys — no automated tooling is provided in V2.0 |
| Vercel cold starts | First request after idle may add ~500ms latency |
| Saved API limit | Hard cap of 20 per user to keep sheet queries fast |
| Call log storage truncation | Prompts are truncated to 2000 chars and responses to 4000 chars in storage; the full values are returned to the client in real-time but not persisted in full |

---

## 18. Out of Scope (V2.0)

- OAuth2 / social login (Google, GitHub)
- Team or organisation accounts (shared API configs across users)
- Admin dashboard for the platform owner
- Billing or subscription management
- Streaming responses (SSE / token-by-token output) in the UI
- File or image upload for multimodal Gemma inputs
- Persistent multi-turn chat sessions
- Public API marketplace or config sharing between users
- Webhook support (POST to external URL on API response)
- Automated migration tooling from Google Sheets to a relational database
- `ENCRYPTION_SECRET` rotation tooling

---

## 19. Acceptance Criteria

The platform is considered complete for V2.0 when all of the following are true:

1. A visitor can sign up and receive a session that persists across page reloads via cookie-based refresh tokens
2. An authenticated user can create, view, edit, and delete saved API configurations with full Gemma parameter control (model, temperature, topP, topK, maxOutputTokens, stop sequences, safety settings, system prompt)
3. An authenticated user can invoke any of their saved API configurations from the UI by entering a prompt and see the response, token usage, latency, and finish reason
4. Call logs are persisted per API and viewable in a paginated history with full prompt and response expansion
5. A shared-tier user is blocked from making API calls after exhausting their daily quota; the quota resets automatically on the next UTC day
6. A user can add their own Google API key, which is validated before saving and encrypted at rest; all subsequent calls use the user's key with no quota restriction
7. A user can remove their own key and revert to the shared tier
8. All four Google Sheets are correctly written to and read from via the Apps Script Web App for all supported actions
9. AES-256-GCM encryption correctly encrypts and decrypts user API keys, with unique IVs per encryption
10. `npm test` passes all unit tests with no failures
11. `npm run test:integration` passes all integration tests against the staging sheet
12. The platform is deployed and fully functional on a public Vercel URL
13. The README provides sufficient documentation for a developer with no prior context to set up and run the project locally and deploy it to Vercel