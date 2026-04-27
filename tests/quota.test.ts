import { POST as callPOST } from '@/app/api/apis/[id]/call/route'
import { signAccessToken } from '@/lib/auth'
import type { SavedApi, User } from '@/lib/types'
import * as encrypt from '@/lib/encrypt'
import * as googleAI from '@/lib/googleAI'
import * as sheets from '@/lib/sheets'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('log-id') }))
jest.mock('@/lib/sheets')
jest.mock('@/lib/googleAI')
jest.mock('@/lib/encrypt')

const USER_ID = 'user-id-1'
const today = new Date().toISOString()
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

const mockApi: SavedApi = {
  id: 'api-id-1',
  userId: USER_ID,
  name: 'Test API',
  description: null,
  model: 'gemma-3-27b-it',
  temperature: 0.5,
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

const baseUser: User = {
  id: USER_ID,
  email: 'test@example.com',
  name: 'Test User',
  passwordHash: null,
  googleId: 'google-sub-123',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: null,
  isActive: true,
  tier: 'shared',
  totalCallCount: 0,
  dailyCallCount: 0,
  dailyCallResetAt: today,
  refreshToken: null,
  refreshTokenExpiresAt: null,
  platformApiKey: null,
}

const mockGemmaResult = {
  text: 'Hello',
  model: 'gemma-3-27b-it',
  finishReason: 'STOP',
  promptTokenCount: 5,
  responseTokenCount: 3,
  totalTokenCount: 8,
  latencyMs: 50,
}

function makeRequest(body: unknown, tier: 'shared' | 'byok' = 'shared'): Request {
  const token = signAccessToken({ sub: USER_ID, email: 'test@example.com', tier })
  return new Request('http://localhost/api/apis/api-id-1/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

function withId(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('quota enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(sheets.getSavedApiById).mockResolvedValue(mockApi)
    jest.mocked(sheets.getUserById).mockResolvedValue(baseUser)
    jest.mocked(sheets.getApiKey).mockResolvedValue(null)
    jest.mocked(sheets.createCallLog).mockResolvedValue({ id: 'log-id' })
    jest.mocked(sheets.incrementApiCallCount).mockResolvedValue(undefined)
    jest.mocked(sheets.incrementCallCounts).mockResolvedValue(undefined)
    jest.mocked(encrypt.decrypt).mockReturnValue('plaintext-key')
    jest.mocked(googleAI.callGemma).mockResolvedValue(mockGemmaResult)
  })

  it('shared-tier user at 0 calls succeeds with 200', async () => {
    const res = await callPOST(makeRequest({ prompt: 'Hello' }), withId('api-id-1'))

    expect(res.status).toBe(200)
    expect(googleAI.callGemma).toHaveBeenCalled()
  })

  it('shared-tier user at daily limit returns 429 QUOTA_EXCEEDED', async () => {
    jest.mocked(sheets.getUserById).mockResolvedValue({ ...baseUser, dailyCallCount: 50, dailyCallResetAt: today })

    const res = await callPOST(makeRequest({ prompt: 'Blocked' }), withId('api-id-1'))
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.error.code).toBe('QUOTA_EXCEEDED')
    expect(googleAI.callGemma).not.toHaveBeenCalled()
  })

  it('first call on new UTC day resets counter and succeeds', async () => {
    jest.mocked(sheets.getUserById).mockResolvedValue({
      ...baseUser,
      dailyCallCount: 50,
      dailyCallResetAt: yesterday,
    })

    const res = await callPOST(makeRequest({ prompt: 'New day' }), withId('api-id-1'))

    expect(res.status).toBe(200)
    expect(sheets.incrementCallCounts).toHaveBeenCalledWith(USER_ID, expect.any(String))
  })

  it('BYOK-tier user is never quota-blocked regardless of call count', async () => {
    jest.mocked(sheets.getUserById).mockResolvedValue({ ...baseUser, tier: 'byok', dailyCallCount: 9999 })
    jest.mocked(sheets.getApiKey).mockResolvedValue({
      encryptedKey: 'enc',
      iv: 'iv',
      keyHint: 'abcd',
      createdAt: '2026-01-01T00:00:00.000Z',
      isValid: true,
    })

    const res = await callPOST(makeRequest({ prompt: 'BYOK no limit' }, 'byok'), withId('api-id-1'))

    expect(res.status).toBe(200)
    expect(googleAI.callGemma).toHaveBeenCalled()
  })
})
