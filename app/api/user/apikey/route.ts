import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { encrypt } from '@/lib/encrypt'
import { listGemmaModels, GoogleAIError } from '@/lib/googleAI'
import * as sheets from '@/lib/sheets'

export async function POST(request: Request) {
  const payload = getAuthPayload(request)
  if (!payload) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' } }, { status: 401 })
  }

  let body: { apiKey?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } }, { status: 400 })
  }

  const apiKey = body.apiKey
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'apiKey is required' } }, { status: 400 })
  }

  try {
    await listGemmaModels(apiKey)
  } catch (err) {
    if (err instanceof GoogleAIError) {
      return NextResponse.json({ error: { code: 'INVALID_API_KEY', message: 'The provided API key is invalid or does not have access to Gemma models' } }, { status: 400 })
    }
    return NextResponse.json({ error: { code: 'UPSTREAM_ERROR', message: 'Failed to validate API key' } }, { status: 502 })
  }

  const { encryptedKey, iv } = encrypt(apiKey)
  const keyHint = apiKey.slice(-4)
  const createdAt = new Date().toISOString()

  await sheets.setApiKey({ userId: payload.sub, encryptedKey, iv, keyHint, createdAt, isValid: true })
  await sheets.updateTier(payload.sub, 'byok')

  return NextResponse.json({ keyHint, tier: 'byok', isValid: true })
}

export async function DELETE(request: Request) {
  const payload = getAuthPayload(request)
  if (!payload) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' } }, { status: 401 })
  }

  const existing = await sheets.getApiKey(payload.sub)
  if (!existing) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No API key found' } }, { status: 404 })
  }

  await sheets.deleteApiKey(payload.sub)
  await sheets.updateTier(payload.sub, 'shared')

  return NextResponse.json({ tier: 'shared' })
}
