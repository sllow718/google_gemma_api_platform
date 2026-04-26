import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getAuthPayload } from '@/lib/auth'
import { CreateApiSchema } from '@/lib/validate'
import { listGemmaModels } from '@/lib/googleAI'
import { getSavedApisByUser, createSavedApi } from '@/lib/sheets'
import type { SavedApi } from '@/lib/types'

const API_LIMIT = 20

export async function GET(request: Request): Promise<Response> {
  const payload = getAuthPayload(request)
  if (!payload) return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })

  const apis = await getSavedApisByUser(payload.sub)
  return NextResponse.json({ apis })
}

export async function POST(request: Request): Promise<Response> {
  const payload = getAuthPayload(request)
  if (!payload) return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON' } }, { status: 400 })
  }

  const parsed = CreateApiSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() } }, { status: 400 })
  }

  const models = await listGemmaModels(process.env.GOOGLE_API_KEY!)
  if (!models.some((m) => m.id === parsed.data.model)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid model ID' } },
      { status: 400 }
    )
  }

  const existing = await getSavedApisByUser(payload.sub)
  if (existing.length >= API_LIMIT) {
    return NextResponse.json({ error: { code: 'API_LIMIT_REACHED', message: `Maximum ${API_LIMIT} APIs per user` } }, { status: 429 })
  }

  const now = new Date().toISOString()
  const api: SavedApi = {
    id: uuidv4(),
    userId: payload.sub,
    name: parsed.data.name,
    description: parsed.data.description ?? '',
    model: parsed.data.model,
    temperature: parsed.data.temperature ?? null,
    topP: parsed.data.topP ?? null,
    topK: parsed.data.topK ?? null,
    maxOutputTokens: parsed.data.maxOutputTokens ?? null,
    stopSequences: parsed.data.stopSequences ?? [],
    safetySettings: parsed.data.safetySettings ?? [],
    systemPrompt: parsed.data.systemPrompt ?? '',
    callCount: 0,
    createdAt: now,
    updatedAt: now,
  }

  await createSavedApi(api)
  return NextResponse.json(api, { status: 201 })
}
