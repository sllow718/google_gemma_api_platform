import { POST as callPOST } from '@/app/api/apis/[id]/call/route'
import { signAccessToken } from '@/lib/auth'
import type { SavedApi, User } from '@/lib/types'
import * as encrypt from '@/lib/encrypt'
import * as googleAI from '@/lib/googleAI'
import * as sheets from '@/lib/sheets'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/lib/sheets')
jest.mock('@/lib/googleAI')
jest.mock('@/lib/encrypt')
jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('call-log-uuid') }))

const OWNER_ID = 'user-id-1'
const OTHER_ID = 'user-id-2'
const today = new Date().toISOString()
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

const mockApi: SavedApi = {
  id: 'api-id-1',
  userId: OWNER_ID,
  name: 'My API',
  description: 'Test API',
  model: 'gemma-3-27b-it',
  temperature: 0.4,
  topP: 0.9,
  topK: 32,
  maxOutputTokens: 512,
  stopSequences: ['END'],
  safetySettings: [],
  systemPrompt: 'Be helpful',
  callCount: 5,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const sharedUser: User = {
  id: OWNER_ID,
  email: 'owner@example.com',
  name: 'Owner',
  passwordHash: '$2b$12$hashedpassword',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: '2026-01-01T00:00:00.000Z',
  isActive: true,
  tier: 'shared',
  totalCallCount: 10,
  dailyCallCount: 2,
  dailyCallResetAt: today,
  refreshToken: null,
  refreshTokenExpiresAt: null,
  platformApiKey: null,
}

const sharedUserAtLimit: User = {
  ...sharedUser,
  dailyCallCount: 50,
  dailyCallResetAt: today,
}

const sharedUserResetOnNewDay: User = {
  ...sharedUserAtLimit,
  dailyCallResetAt: yesterday,
}

const byokUser: User = {
  ...sharedUser,
  tier: 'byok',
  dailyCallCount: 500,
}

const mockCallGemmaResult = {
  text: 'Generated answer',
  model: 'gemma-3-27b-it',
  finishReason: 'STOP',
  promptTokenCount: 12,
  responseTokenCount: 18,
  totalTokenCount: 30,
  latencyMs: 123,
}

function makeRequest(method: string, body?: unknown, headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/test', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function authHeader(userId = OWNER_ID, tier: 'shared' | 'byok' = 'shared'): Record<string, string> {
  const token = signAccessToken({ sub: userId, email: 'test@example.com', tier })
  return { Authorization: `Bearer ${token}` }
}

function withId(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

describe('apis.call routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    jest.mocked(sheets.getSavedApiById).mockResolvedValue(mockApi)
    jest.mocked(sheets.getUserById).mockResolvedValue(sharedUser)
    jest.mocked(sheets.getApiKey).mockResolvedValue(null)
    jest.mocked(sheets.createCallLog).mockResolvedValue({ id: 'call-log-uuid' })
    jest.mocked(sheets.incrementApiCallCount).mockResolvedValue(undefined)
    jest.mocked(sheets.incrementCallCounts).mockResolvedValue(undefined)
    jest.mocked(encrypt.decrypt).mockReturnValue('plaintext-api-key')
    jest.mocked(googleAI.callGemma).mockResolvedValue(mockCallGemmaResult)
  })

  it('call API (shared tier, within quota) returns 200 with text and usage', async () => {
    const res = await callPOST(
      makeRequest('POST', { prompt: 'Hello world' }, authHeader()),
      withId('api-id-1')
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.text).toBe(mockCallGemmaResult.text)
    expect(body.model).toBe(mockCallGemmaResult.model)
    expect(body.usage).toEqual({
      promptTokenCount: 12,
      responseTokenCount: 18,
      totalTokenCount: 30,
    })
    expect(body.callLogId).toBe('call-log-uuid')
    expect(googleAI.callGemma).toHaveBeenCalledWith(
      process.env.GOOGLE_API_KEY,
      expect.objectContaining({
        model: 'gemma-3-27b-it',
        temperature: 0.4,
        topP: 0.9,
        topK: 32,
        maxOutputTokens: 512,
        systemPrompt: 'Be helpful',
      }),
      'Hello world'
    )
  })

  it('call API with parameter override applies override to generation config', async () => {
    const res = await callPOST(
      makeRequest('POST', {
        prompt: 'Override test',
        overrides: { temperature: 0.8, maxOutputTokens: 256 },
      }, authHeader()),
      withId('api-id-1')
    )

    expect(res.status).toBe(200)
    expect(googleAI.callGemma).toHaveBeenCalledWith(
      process.env.GOOGLE_API_KEY,
      expect.objectContaining({
        temperature: 0.8,
        maxOutputTokens: 256,
      }),
      'Override test'
    )
  })

  it('call API (shared tier, quota exhausted) returns 429 QUOTA_EXCEEDED', async () => {
    jest.mocked(sheets.getUserById).mockResolvedValue(sharedUserAtLimit)

    const res = await callPOST(
      makeRequest('POST', { prompt: 'Blocked by quota' }, authHeader()),
      withId('api-id-1')
    )
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.error.code).toBe('QUOTA_EXCEEDED')
    expect(googleAI.callGemma).not.toHaveBeenCalled()
  })

  it('first call on a new UTC day resets shared-tier counter and succeeds', async () => {
    jest.mocked(sheets.getUserById).mockResolvedValue(sharedUserResetOnNewDay)

    const res = await callPOST(
      makeRequest('POST', { prompt: 'New day call' }, authHeader()),
      withId('api-id-1')
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.callLogId).toBe('call-log-uuid')
    expect(sheets.incrementCallCounts).toHaveBeenCalledWith(OWNER_ID, expect.any(String))
  })

  it('call API (BYOK tier, any call count) succeeds without quota check', async () => {
    jest.mocked(sheets.getUserById).mockResolvedValue(byokUser)
    jest.mocked(sheets.getApiKey).mockResolvedValue({
      encryptedKey: 'encrypted-api-key',
      iv: 'iv-base64',
      keyHint: '1234',
      createdAt: '2026-01-01T00:00:00.000Z',
      isValid: true,
    })

    const res = await callPOST(
      makeRequest('POST', { prompt: 'BYOK call' }, authHeader(OWNER_ID, 'byok')),
      withId('api-id-1')
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.text).toBe(mockCallGemmaResult.text)
    expect(encrypt.decrypt).toHaveBeenCalledWith('encrypted-api-key', 'iv-base64')
    expect(googleAI.callGemma).toHaveBeenCalledWith(
      'plaintext-api-key',
      expect.objectContaining({
        maxOutputTokens: 512,
      }),
      'BYOK call'
    )
  })

  it('call API without auth token returns 401 UNAUTHORIZED', async () => {
    const res = await callPOST(makeRequest('POST', { prompt: 'No auth' }), withId('api-id-1'))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('call API belonging to another user returns 403 FORBIDDEN', async () => {
    jest.mocked(sheets.getSavedApiById).mockResolvedValue({ ...mockApi, userId: OTHER_ID })

    const res = await callPOST(
      makeRequest('POST', { prompt: 'Wrong owner' }, authHeader()),
      withId('api-id-1')
    )
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error.code).toBe('FORBIDDEN')
    expect(googleAI.callGemma).not.toHaveBeenCalled()
  })

  it('call API with prompt > 32000 chars returns 400 VALIDATION_ERROR', async () => {
    const res = await callPOST(
      makeRequest('POST', { prompt: 'x'.repeat(32001) }, authHeader()),
      withId('api-id-1')
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('successful call creates a CallLog row in sheets', async () => {
    const res = await callPOST(
      makeRequest('POST', { prompt: 'Create log' }, authHeader()),
      withId('api-id-1')
    )

    expect(res.status).toBe(200)
    expect(sheets.createCallLog).toHaveBeenCalledTimes(1)
    expect(sheets.createCallLog).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'call-log-uuid',
        savedApiId: 'api-id-1',
        userId: OWNER_ID,
        prompt: 'Create log',
        responseText: mockCallGemmaResult.text,
        model: mockCallGemmaResult.model,
        finishReason: 'STOP',
        tier: 'shared',
      })
    )
  })

  it('successful call increments callCount on the SavedApi', async () => {
    const res = await callPOST(
      makeRequest('POST', { prompt: 'Count API' }, authHeader()),
      withId('api-id-1')
    )

    expect(res.status).toBe(200)
    expect(sheets.incrementApiCallCount).toHaveBeenCalledWith('api-id-1')
  })

  it('successful call increments user daily and total counts', async () => {
    const res = await callPOST(
      makeRequest('POST', { prompt: 'Count user' }, authHeader()),
      withId('api-id-1')
    )

    expect(res.status).toBe(200)
    expect(sheets.incrementCallCounts).toHaveBeenCalledWith(OWNER_ID, expect.any(String))
  })
})
