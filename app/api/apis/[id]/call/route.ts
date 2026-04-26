import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getAuthPayload } from '@/lib/auth'
import { decrypt } from '@/lib/encrypt'
import { callGemma, GoogleAIError } from '@/lib/googleAI'
import { CallApiSchema } from '@/lib/validate'
import {
  createCallLog,
  getApiKey,
  getSavedApiById,
  getUserById,
  incrementApiCallCount,
  incrementCallCounts,
} from '@/lib/sheets'
import type { CallLog, SavedApi, Tier, User } from '@/lib/types'

type Ctx = { params: Promise<{ id: string }> }

const DEFAULT_SHARED_DAILY_LIMIT = 50
const SHARED_MAX_OUTPUT_TOKENS = 4096

function jsonError(
  status: number,
  code: string,
  message?: string,
  details?: Record<string, unknown>
): Response {
  return NextResponse.json(
    { error: { code, ...(message ? { message } : {}), ...(details ? { details } : {}) } },
    { status }
  )
}

function utcDateString(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function sameUtcDay(left: string | null, right: string): boolean {
  if (!left) return false
  return left.slice(0, 10) === right.slice(0, 10)
}

function sharedDailyCount(user: User, currentDate: string): number {
  return sameUtcDay(user.dailyCallResetAt, currentDate) ? user.dailyCallCount : 0
}

function resolveMaxOutputTokens(
  tier: Tier,
  saved: number | null,
  override: number | null | undefined
): number | null {
  const configured = override ?? saved
  if (tier !== 'shared') return configured ?? null
  if (configured == null) return SHARED_MAX_OUTPUT_TOKENS
  return Math.min(configured, SHARED_MAX_OUTPUT_TOKENS)
}

function buildCallConfig(
  api: SavedApi,
  tier: Tier,
  promptOverrides: { temperature?: number | null; maxOutputTokens?: number | null }
) {
  return {
    model: api.model,
    temperature: promptOverrides.temperature ?? api.temperature ?? undefined,
    topP: api.topP ?? undefined,
    topK: api.topK ?? undefined,
    maxOutputTokens: resolveMaxOutputTokens(
      tier,
      api.maxOutputTokens,
      promptOverrides.maxOutputTokens
    ),
    stopSequences: api.stopSequences,
    safetySettings: api.safetySettings,
    systemPrompt: api.systemPrompt ?? undefined,
  }
}

export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const payload = getAuthPayload(request)
    if (!payload) return jsonError(401, 'UNAUTHORIZED')

    const { id } = await params
    const api = await getSavedApiById(id)
    if (!api) return jsonError(404, 'NOT_FOUND')
    if (api.userId !== payload.sub) return jsonError(403, 'FORBIDDEN')

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid JSON')
    }

    const parsed = CallApiSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', undefined, parsed.error.flatten())
    }

    const user = await getUserById(payload.sub)
    if (!user) return jsonError(401, 'UNAUTHORIZED')

    const currentDate = utcDateString(new Date())
    const sharedDailyLimit = Number.parseInt(
      process.env.SHARED_TIER_DAILY_LIMIT ?? String(DEFAULT_SHARED_DAILY_LIMIT),
      10
    )

    const sharedKey = process.env.GOOGLE_API_KEY
    if (!sharedKey) {
      return jsonError(500, 'INTERNAL_ERROR', 'GOOGLE_API_KEY is not configured')
    }
    let apiKey: string = sharedKey

    if (user.tier === 'shared') {
      const effectiveDailyCount = sharedDailyCount(user, currentDate)
      if (effectiveDailyCount >= sharedDailyLimit) {
        return jsonError(429, 'QUOTA_EXCEEDED', 'Shared-tier daily quota exhausted')
      }
    } else {
      const storedKey = await getApiKey(user.id)
      if (!storedKey) {
        return jsonError(404, 'NOT_FOUND', 'No API key stored for this user')
      }

      apiKey = decrypt(storedKey.encryptedKey, storedKey.iv)
    }

    const config = buildCallConfig(api, user.tier, parsed.data.overrides ?? {})
    const result = await callGemma(apiKey, config, parsed.data.prompt)
    const callLogId = uuidv4()

    const callLog: CallLog = {
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

    await createCallLog(callLog)
    await Promise.all([incrementApiCallCount(api.id), incrementCallCounts(user.id, currentDate)])

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
  } catch (error) {
    if (error instanceof GoogleAIError || (error as { code?: string } | null)?.code === 'UPSTREAM_ERROR') {
      return jsonError(502, 'UPSTREAM_ERROR', error instanceof Error ? error.message : 'Upstream error')
    }

    if ((error as { code?: string } | null)?.code === 'SHEETS_UNAVAILABLE') {
      return jsonError(503, 'SHEETS_UNAVAILABLE', error instanceof Error ? error.message : 'Supabase unavailable')
    }

    return jsonError(500, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Unexpected error')
  }
}
