import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { decrypt } from '@/lib/encrypt'
import { callGemma, GoogleAIError } from '@/lib/googleAI'
import { CallApiSchema } from '@/lib/validate'
import {
  createCallLog,
  getApiKey,
  getSavedApiById,
  getUserByPlatformApiKey,
  incrementApiCallCount,
  incrementCallCounts,
} from '@/lib/sheets'
import type { CallLog, SavedApi, Tier, User } from '@/lib/types'

type Ctx = { params: Promise<{ id: string }> }

const DEFAULT_SHARED_DAILY_LIMIT = 50
const SHARED_MAX_OUTPUT_TOKENS = 4096

function jsonError(status: number, code: string, message?: string): Response {
  return NextResponse.json({ error: { code, ...(message ? { message } : {}) } }, { status })
}

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function sameUtcDay(a: string | null, b: string): boolean {
  return !!a && a.slice(0, 10) === b.slice(0, 10)
}

function effectiveDailyCount(user: User, today: string): number {
  return sameUtcDay(user.dailyCallResetAt, today) ? user.dailyCallCount : 0
}

function resolveMaxOutputTokens(tier: Tier, saved: number | null, override?: number | null): number | null {
  const configured = override ?? saved
  if (tier !== 'shared') return configured ?? null
  return configured == null ? SHARED_MAX_OUTPUT_TOKENS : Math.min(configured, SHARED_MAX_OUTPUT_TOKENS)
}

function buildConfig(api: SavedApi, tier: Tier, overrides: { temperature?: number | null; maxOutputTokens?: number | null } = {}) {
  return {
    model: api.model,
    temperature: overrides.temperature ?? api.temperature ?? undefined,
    topP: api.topP ?? undefined,
    topK: api.topK ?? undefined,
    maxOutputTokens: resolveMaxOutputTokens(tier, api.maxOutputTokens, overrides.maxOutputTokens),
    stopSequences: api.stopSequences,
    safetySettings: api.safetySettings,
    systemPrompt: api.systemPrompt ?? undefined,
  }
}

export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    // Authenticate via X-API-Key header
    const platformKey = request.headers.get('X-API-Key')
    if (!platformKey) return jsonError(401, 'UNAUTHORIZED', 'X-API-Key header is required')

    const user = await getUserByPlatformApiKey(platformKey)
    if (!user) return jsonError(401, 'UNAUTHORIZED', 'Invalid API key')

    const { id } = await params
    const api = await getSavedApiById(id)
    if (!api) return jsonError(404, 'NOT_FOUND', 'Configuration not found')
    if (api.userId !== user.id) return jsonError(403, 'FORBIDDEN', 'This configuration belongs to another user')

    let body: unknown
    try { body = await request.json() } catch {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid JSON body')
    }

    const parsed = CallApiSchema.safeParse(body)
    if (!parsed.success) return jsonError(400, 'VALIDATION_ERROR', 'Invalid request body')

    const sharedDailyLimit = Number.parseInt(process.env.SHARED_TIER_DAILY_LIMIT ?? String(DEFAULT_SHARED_DAILY_LIMIT), 10)
    const today = utcDateString(new Date())

    const sharedKey = process.env.GOOGLE_API_KEY
    if (!sharedKey) return jsonError(500, 'INTERNAL_ERROR', 'GOOGLE_API_KEY not configured')
    let apiKey = sharedKey

    if (user.tier === 'shared') {
      if (effectiveDailyCount(user, today) >= sharedDailyLimit) {
        return jsonError(429, 'QUOTA_EXCEEDED', 'Shared-tier daily quota exhausted')
      }
    } else {
      const stored = await getApiKey(user.id)
      if (!stored) return jsonError(404, 'NOT_FOUND', 'No Google API key stored for this user')
      apiKey = decrypt(stored.encryptedKey, stored.iv)
    }

    const config = buildConfig(api, user.tier, parsed.data.overrides)
    const result = await callGemma(apiKey, config, parsed.data.prompt)
    const callLogId = uuidv4()

    const log: CallLog = {
      id: callLogId,
      savedApiId: api.id,
      userId: user.id,
      prompt: parsed.data.prompt.slice(0, 2000),
      responseText: result.text.slice(0, 4000),
      model: result.model,
      promptTokenCount: result.promptTokenCount,
      responseTokenCount: result.responseTokenCount,
      totalTokenCount: result.totalTokenCount,
      finishReason: result.finishReason,
      tier: user.tier,
      latencyMs: result.latencyMs,
      createdAt: new Date().toISOString(),
    }

    await createCallLog(log)
    await Promise.all([incrementApiCallCount(api.id), incrementCallCounts(user.id, today)])

    return NextResponse.json({
      text: result.text,
      model: result.model,
      finishReason: result.finishReason,
      usage: {
        promptTokenCount: result.promptTokenCount,
        responseTokenCount: result.responseTokenCount,
        totalTokenCount: result.totalTokenCount,
      },
      latencyMs: result.latencyMs,
      callLogId,
    })
  } catch (err) {
    if (err instanceof GoogleAIError) return jsonError(502, 'UPSTREAM_ERROR', err.message)
    if ((err as { code?: string })?.code === 'SHEETS_UNAVAILABLE') return jsonError(503, 'SHEETS_UNAVAILABLE')
    return jsonError(500, 'INTERNAL_ERROR')
  }
}
