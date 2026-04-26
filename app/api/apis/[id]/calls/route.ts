import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { getCallLogsByApi, getSavedApiById } from '@/lib/sheets'

type Ctx = { params: Promise<{ id: string }> }

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

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

function parsePositiveInteger(value: string | null, fallback: number, field: string): number {
  if (value == null || value === '') return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid ${field}`)
  }
  return parsed
}

function summarizeCall(call: {
  id: string
  prompt: string
  responseText: string
  model: string
  totalTokenCount: number
  finishReason: string
  tier: 'shared' | 'byok'
  latencyMs: number
  createdAt: string
}) {
  return {
    id: call.id,
    prompt: call.prompt,
    responseText: call.responseText,
    model: call.model,
    totalTokenCount: call.totalTokenCount,
    finishReason: call.finishReason,
    tier: call.tier,
    latencyMs: call.latencyMs,
    createdAt: call.createdAt,
  }
}

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const payload = getAuthPayload(request)
    if (!payload) return jsonError(401, 'UNAUTHORIZED')

    const { id } = await params
    const api = await getSavedApiById(id)
    if (!api) return jsonError(404, 'NOT_FOUND')
    if (api.userId !== payload.sub) return jsonError(403, 'FORBIDDEN')

    const url = new URL(request.url)

    let page: number
    let limit: number
    try {
      page = parsePositiveInteger(url.searchParams.get('page'), 1, 'page')
      limit = parsePositiveInteger(url.searchParams.get('limit'), DEFAULT_LIMIT, 'limit')
    } catch {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid pagination parameters')
    }

    const cappedLimit = Math.min(limit, MAX_LIMIT)
    const { calls, total } = await getCallLogsByApi(id, page, cappedLimit)

    return NextResponse.json({
      calls: calls.map(summarizeCall),
      total,
      page,
      limit: cappedLimit,
    })
  } catch (error) {
    return jsonError(500, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Unexpected error')
  }
}
