import { POST, DELETE } from '@/app/api/user/apikey/route'
import { signAccessToken } from '@/lib/auth'
import * as encrypt from '@/lib/encrypt'
import * as googleAI from '@/lib/googleAI'
import * as sheets from '@/lib/sheets'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('mock-uuid') }))
jest.mock('@/lib/sheets')
jest.mock('@/lib/googleAI')
jest.mock('@/lib/encrypt')

const USER_ID = 'user-id-1'

const existingKey = {
  encryptedKey: 'enc-key-old',
  iv: 'iv-old',
  keyHint: 'zzzz',
  createdAt: '2026-01-01T00:00:00.000Z',
  isValid: true,
}

function makeRequest(method: string, body?: unknown, headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/user/apikey', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function authHeader(userId = USER_ID): Record<string, string> {
  const token = signAccessToken({ sub: userId, email: 'test@example.com', tier: 'shared' })
  return { Authorization: `Bearer ${token}` }
}

describe('user.apikey routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(googleAI.listGemmaModels).mockResolvedValue([
      { id: 'gemma-3-27b-it', displayName: 'Gemma 3 27B', inputTokenLimit: 8192, outputTokenLimit: 4096 },
    ])
    jest.mocked(encrypt.encrypt).mockReturnValue({ encryptedKey: 'enc-key-new', iv: 'iv-new' })
    jest.mocked(sheets.setApiKey).mockResolvedValue(undefined)
    jest.mocked(sheets.updateTier).mockResolvedValue(undefined)
    jest.mocked(sheets.deleteApiKey).mockResolvedValue(undefined)
    jest.mocked(sheets.getApiKey).mockResolvedValue(null)
  })

  it('add valid Google API key returns 200 with tier byok and keyHint', async () => {
    const apiKey = 'AIzaSyValidKey1234'
    const res = await POST(makeRequest('POST', { apiKey }, authHeader()))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.tier).toBe('byok')
    expect(body.isValid).toBe(true)
    expect(body.keyHint).toBe('1234')
    expect(sheets.setApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, keyHint: '1234', isValid: true })
    )
    expect(sheets.updateTier).toHaveBeenCalledWith(USER_ID, 'byok')
  })

  it('add invalid Google API key returns 400 INVALID_API_KEY', async () => {
    jest.mocked(googleAI.listGemmaModels).mockRejectedValue(
      new googleAI.GoogleAIError('UPSTREAM_ERROR', 'API key not valid')
    )

    const res = await POST(makeRequest('POST', { apiKey: 'AIzaBadKey' }, authHeader()))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_API_KEY')
    expect(sheets.setApiKey).not.toHaveBeenCalled()
    expect(sheets.updateTier).not.toHaveBeenCalled()
  })

  it('add key when one already exists overwrites and returns new keyHint', async () => {
    jest.mocked(sheets.getApiKey).mockResolvedValue(existingKey)
    const newKey = 'AIzaSyNewKey5678'

    const res = await POST(makeRequest('POST', { apiKey: newKey }, authHeader()))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.keyHint).toBe('5678')
    expect(sheets.setApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, keyHint: '5678' })
    )
  })

  it('remove key when key exists returns 200 with tier shared', async () => {
    jest.mocked(sheets.getApiKey).mockResolvedValue(existingKey)

    const res = await DELETE(makeRequest('DELETE', undefined, authHeader()))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.tier).toBe('shared')
    expect(sheets.deleteApiKey).toHaveBeenCalledWith(USER_ID)
    expect(sheets.updateTier).toHaveBeenCalledWith(USER_ID, 'shared')
  })

  it('remove key when none exists returns 404 NOT_FOUND', async () => {
    jest.mocked(sheets.getApiKey).mockResolvedValue(null)

    const res = await DELETE(makeRequest('DELETE', undefined, authHeader()))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
    expect(sheets.deleteApiKey).not.toHaveBeenCalled()
  })
})
