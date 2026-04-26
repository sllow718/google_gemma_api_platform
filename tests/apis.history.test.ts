import { GET as historyGET } from '@/app/api/apis/[id]/calls/route'
import { signAccessToken } from '@/lib/auth'
import type { CallLog, SavedApi } from '@/lib/types'
import * as sheets from '@/lib/sheets'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/lib/sheets')
jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('history-uuid') }))

const OWNER_ID = 'user-id-1'
const OTHER_ID = 'user-id-2'

const mockApi: SavedApi = {
  id: 'api-id-1',
  userId: OWNER_ID,
  name: 'My API',
  description: 'Test API',
  model: 'gemma-3-27b-it',
  temperature: 0.7,
  topP: null,
  topK: null,
  maxOutputTokens: null,
  stopSequences: [],
  safetySettings: [],
  systemPrompt: '',
  callCount: 5,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const allCalls: CallLog[] = Array.from({ length: 60 }, (_, index) => ({
  id: `call-${index + 1}`,
  savedApiId: mockApi.id,
  userId: OWNER_ID,
  prompt: `Prompt ${index + 1}`,
  responseText: `Response ${index + 1}`,
  model: mockApi.model,
  promptTokenCount: 10,
  responseTokenCount: 20,
  totalTokenCount: 30,
  finishReason: 'STOP',
  tier: 'shared',
  latencyMs: 100 + index,
  createdAt: `2026-04-26T09:${String(index).padStart(2, '0')}:00.000Z`,
}))

function makeRequest(method: string, url: string, headers?: Record<string, string>): Request {
  return new Request(url, { method, headers: { 'Content-Type': 'application/json', ...headers } })
}

function authHeader(userId = OWNER_ID): Record<string, string> {
  const token = signAccessToken({ sub: userId, email: 'test@example.com', tier: 'shared' })
  return { Authorization: `Bearer ${token}` }
}

function withId(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

describe('apis.history routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    jest.mocked(sheets.getSavedApiById).mockResolvedValue(mockApi)
    jest.mocked(sheets.getCallLogsByApi).mockImplementation(async (_id, page, limit) => {
      const start = (page - 1) * limit
      return {
        calls: allCalls.slice(start, start + limit),
        total: allCalls.length,
      }
    })
  })

  it('get call history for own API returns 200 with paginated list', async () => {
    const res = await historyGET(
      makeRequest('GET', 'http://localhost/api/apis/api-id-1/calls?page=1&limit=20', authHeader()),
      withId('api-id-1')
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.total).toBe(60)
    expect(body.page).toBe(1)
    expect(body.limit).toBe(20)
    expect(body.calls).toHaveLength(20)
    expect(body.calls[0]).toMatchObject({
      id: 'call-1',
      prompt: 'Prompt 1',
      responseText: 'Response 1',
      model: 'gemma-3-27b-it',
      totalTokenCount: 30,
      finishReason: 'STOP',
      tier: 'shared',
      latencyMs: 100,
    })
    expect(sheets.getCallLogsByApi).toHaveBeenCalledWith('api-id-1', 1, 20)
  })

  it('get call history for another user API returns 403 FORBIDDEN', async () => {
    jest.mocked(sheets.getSavedApiById).mockResolvedValue({ ...mockApi, userId: OTHER_ID })

    const res = await historyGET(
      makeRequest('GET', 'http://localhost/api/apis/api-id-1/calls?page=1&limit=20', authHeader()),
      withId('api-id-1')
    )
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error.code).toBe('FORBIDDEN')
    expect(sheets.getCallLogsByApi).not.toHaveBeenCalled()
  })

  it('pagination page=2 returns correct offset', async () => {
    const res = await historyGET(
      makeRequest('GET', 'http://localhost/api/apis/api-id-1/calls?page=2&limit=20', authHeader()),
      withId('api-id-1')
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.page).toBe(2)
    expect(body.limit).toBe(20)
    expect(body.calls[0].id).toBe('call-21')
    expect(body.calls[19].id).toBe('call-40')
    expect(sheets.getCallLogsByApi).toHaveBeenCalledWith('api-id-1', 2, 20)
  })

  it('limit param above max is capped at 50', async () => {
    const res = await historyGET(
      makeRequest('GET', 'http://localhost/api/apis/api-id-1/calls?page=1&limit=999', authHeader()),
      withId('api-id-1')
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.limit).toBe(50)
    expect(body.calls).toHaveLength(50)
    expect(sheets.getCallLogsByApi).toHaveBeenCalledWith('api-id-1', 1, 50)
  })
})
