import { POST as v1POST } from '@/app/api/v1/[id]/call/route'
import type { SavedApi, User } from '@/lib/types'
import * as sheets from '@/lib/sheets'
import * as googleAI from '@/lib/googleAI'
import * as encrypt from '@/lib/encrypt'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('log-uuid') }))
jest.mock('@/lib/sheets')
jest.mock('@/lib/googleAI')
jest.mock('@/lib/encrypt')

const OWNER_ID = 'user-id-1'
const OTHER_ID = 'user-id-2'
const PLATFORM_KEY = 'gmp_abc123'
const today = new Date().toISOString()

const mockApi: SavedApi = {
  id: 'api-id-1',
  userId: OWNER_ID,
  name: 'Test API',
  description: null,
  model: 'gemma-3-27b-it',
  temperature: 0.7,
  topP: null,
  topK: null,
  maxOutputTokens: 512,
  stopSequences: [],
  safetySettings: [],
  systemPrompt: null,
  callCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const sharedUser: User = {
  id: OWNER_ID,
  email: 'owner@example.com',
  name: 'Owner',
  passwordHash: '$2b$12$hash',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: null,
  isActive: true,
  tier: 'shared',
  totalCallCount: 0,
  dailyCallCount: 2,
  dailyCallResetAt: today,
  refreshToken: null,
  refreshTokenExpiresAt: null,
  platformApiKey: PLATFORM_KEY,
}

const byokUser: User = { ...sharedUser, tier: 'byok', dailyCallCount: 9999 }

const mockGemmaResult = {
  text: 'Generated response',
  model: 'gemma-3-27b-it',
  finishReason: 'STOP',
  promptTokenCount: 10,
  responseTokenCount: 20,
  totalTokenCount: 30,
  latencyMs: 100,
}

function makeRequest(prompt: string, apiKey = PLATFORM_KEY): Request {
  return new Request('http://localhost/api/v1/api-id-1/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ prompt }),
  })
}

function withId(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/v1/:id/call', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(sheets.getUserByPlatformApiKey).mockResolvedValue(sharedUser)
    jest.mocked(sheets.getSavedApiById).mockResolvedValue(mockApi)
    jest.mocked(sheets.getUserById).mockResolvedValue(sharedUser)
    jest.mocked(sheets.getApiKey).mockResolvedValue(null)
    jest.mocked(sheets.createCallLog).mockResolvedValue({ id: 'log-uuid' })
    jest.mocked(sheets.incrementApiCallCount).mockResolvedValue(undefined)
    jest.mocked(sheets.incrementCallCounts).mockResolvedValue(undefined)
    jest.mocked(googleAI.callGemma).mockResolvedValue(mockGemmaResult)
    jest.mocked(encrypt.decrypt).mockReturnValue('plaintext-google-key')
  })

  it('returns 200 with generated text for valid key and owned config', async () => {
    const res = await v1POST(makeRequest('Hello'), withId('api-id-1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.text).toBe('Generated response')
    expect(body.usage.totalTokenCount).toBe(30)
    expect(body.callLogId).toBe('log-uuid')
  })

  it('returns 401 UNAUTHORIZED for invalid or missing X-API-Key', async () => {
    jest.mocked(sheets.getUserByPlatformApiKey).mockResolvedValue(null)

    const res = await v1POST(makeRequest('Hello', 'invalid-key'), withId('api-id-1'))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(googleAI.callGemma).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN when config belongs to a different user', async () => {
    jest.mocked(sheets.getSavedApiById).mockResolvedValue({ ...mockApi, userId: OTHER_ID })

    const res = await v1POST(makeRequest('Hello'), withId('api-id-1'))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error.code).toBe('FORBIDDEN')
    expect(googleAI.callGemma).not.toHaveBeenCalled()
  })

  it('returns 429 QUOTA_EXCEEDED for shared-tier user at daily limit', async () => {
    jest.mocked(sheets.getUserByPlatformApiKey).mockResolvedValue({ ...sharedUser, dailyCallCount: 50 })

    const res = await v1POST(makeRequest('Hello'), withId('api-id-1'))
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.error.code).toBe('QUOTA_EXCEEDED')
    expect(googleAI.callGemma).not.toHaveBeenCalled()
  })

  it('BYOK user bypasses quota and uses their own decrypted key', async () => {
    jest.mocked(sheets.getUserByPlatformApiKey).mockResolvedValue(byokUser)
    jest.mocked(sheets.getApiKey).mockResolvedValue({
      encryptedKey: 'enc', iv: 'iv', keyHint: 'abcd',
      createdAt: '2026-01-01T00:00:00.000Z', isValid: true,
    })

    const res = await v1POST(makeRequest('Hello'), withId('api-id-1'))

    expect(res.status).toBe(200)
    expect(encrypt.decrypt).toHaveBeenCalledWith('enc', 'iv')
    expect(googleAI.callGemma).toHaveBeenCalledWith('plaintext-google-key', expect.anything(), 'Hello')
  })
})
