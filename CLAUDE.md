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

`npm test` → 28 passing, 0 failures.

### Next phase

**Phase 6** — API execution + call history:
- `POST /api/apis/[id]/call` — shared/BYOK quota check → callGemma → createCallLog → increment counters → return response
- `GET /api/apis/[id]/calls` — paginated call history (ownership check, limit capped at 50)
- `tests/apis.call.test.ts` — 10 cases (§14.3)
- `tests/apis.history.test.ts` — 4 cases (§14.4)

### Key architectural decisions

- **Sheets secret**: passes as `body.secret` in POST body (Apps Script cannot read HTTP headers)
- **Refresh cookie**: name `refreshToken`, value `{userId}:{token}` — encodes userId so refresh endpoint can look up the stored token without an extra sheet action
- **Auth helper**: `getAuthPayload(request)` in `lib/auth.ts` — returns `AccessTokenPayload | null`, used by every authenticated route
- **Dynamic params**: Next.js 16 `params` is a `Promise<{id}>` — always `await params` in route handlers
- **listGemmaModels**: calls Google REST API directly (SDK has no listModels); 1-hour in-memory cache in `lib/googleAI.ts`
- **Test pattern**: mock `next/headers` in every test file (lib/auth imports it at module level); use real `signAccessToken` to create auth tokens in tests

### Manual setup still required (Phase 2)

Create Google Sheets workbook with 4 tabs (`Users`, `UserApiKeys`, `SavedApis`, `CallLogs`) + column headers matching `Requirements.MD §5`. In Apps Script editor: set Script Properties `SPREADSHEET_ID` and `SHEETS_SECRET`, deploy as Web App (Execute as Me / Anyone), copy URL to `.env.local` as `SHEETS_WEBHOOK_URL`.
