import { POST as apisPOST, GET as apisGET } from '@/app/api/apis/route'
import { GET as apiIdGET, PUT as apiIdPUT, DELETE as apiIdDELETE } from '@/app/api/apis/[id]/route'
import { signAccessToken } from '@/lib/auth'
import type { SavedApi } from '@/lib/types'
import * as sheets from '@/lib/sheets'
import * as googleAI from '@/lib/googleAI'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/lib/sheets')
jest.mock('@/lib/googleAI')
jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('new-api-uuid') }))

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

const mockModels: googleAI.GemmaModel[] = [
  { id: 'gemma-3-27b-it', displayName: 'Gemma 3 27B', inputTokenLimit: 8192, outputTokenLimit: 8192 },
]

function makeRequest(method: string, body?: unknown, headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/test', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function authHeader(userId = OWNER_ID): Record<string, string> {
  const token = signAccessToken({ sub: userId, email: 'test@example.com', tier: 'shared' })
  return { Authorization: `Bearer ${token}` }
}

function withId(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

describe('apis.crud routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(googleAI.listGemmaModels).mockResolvedValue(mockModels)
    jest.mocked(sheets.getSavedApisByUser).mockResolvedValue([])
    jest.mocked(sheets.createSavedApi).mockResolvedValue({ id: 'new-api-uuid' })
    jest.mocked(sheets.getSavedApiById).mockResolvedValue(null)
    jest.mocked(sheets.updateSavedApi).mockResolvedValue(undefined)
    jest.mocked(sheets.deleteSavedApi).mockResolvedValue(undefined)
    jest.mocked(sheets.deleteCallLogsByApi).mockResolvedValue(undefined)
  })

  // ===== CREATE =====

  it('create API with valid config returns 201 with full SavedApi', async () => {
    const res = await apisPOST(
      makeRequest('POST', { name: 'Test API', model: 'gemma-3-27b-it' }, authHeader())
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.id).toBe('new-api-uuid')
    expect(body.name).toBe('Test API')
    expect(body.model).toBe('gemma-3-27b-it')
    expect(body.userId).toBe(OWNER_ID)
    expect(body.callCount).toBe(0)
  })

  it('create API with invalid model ID returns 400 VALIDATION_ERROR', async () => {
    const res = await apisPOST(
      makeRequest('POST', { name: 'Test', model: 'not-a-real-model' }, authHeader())
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('create API with temperature > 2 returns 400 VALIDATION_ERROR', async () => {
    const res = await apisPOST(
      makeRequest('POST', { name: 'Test', model: 'gemma-3-27b-it', temperature: 2.5 }, authHeader())
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('create 21st API returns 429 API_LIMIT_REACHED', async () => {
    jest.mocked(sheets.getSavedApisByUser).mockResolvedValue(Array(20).fill(mockApi))

    const res = await apisPOST(
      makeRequest('POST', { name: 'One too many', model: 'gemma-3-27b-it' }, authHeader())
    )
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.error.code).toBe('API_LIMIT_REACHED')
  })

  // ===== LIST =====

  it('list APIs returns only the requesting user APIs', async () => {
    jest.mocked(sheets.getSavedApisByUser).mockResolvedValue([mockApi])

    const res = await apisGET(makeRequest('GET', undefined, authHeader()))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.apis).toHaveLength(1)
    expect(body.apis[0].id).toBe('api-id-1')
    expect(sheets.getSavedApisByUser).toHaveBeenCalledWith(OWNER_ID)
  })

  // ===== GET BY ID =====

  it('get API by ID as owner returns 200 with full config', async () => {
    jest.mocked(sheets.getSavedApiById).mockResolvedValue(mockApi)

    const res = await apiIdGET(makeRequest('GET', undefined, authHeader()), withId('api-id-1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.id).toBe('api-id-1')
    expect(body.model).toBe('gemma-3-27b-it')
  })

  it('get API by ID as different user returns 403 FORBIDDEN', async () => {
    jest.mocked(sheets.getSavedApiById).mockResolvedValue(mockApi) // owned by OWNER_ID

    const res = await apiIdGET(makeRequest('GET', undefined, authHeader(OTHER_ID)), withId('api-id-1'))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error.code).toBe('FORBIDDEN')
  })

  // ===== UPDATE =====

  it('update API name returns 200 with updated object', async () => {
    jest.mocked(sheets.getSavedApiById).mockResolvedValue(mockApi)

    const res = await apiIdPUT(
      makeRequest('PUT', { name: 'Updated Name' }, authHeader()),
      withId('api-id-1')
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.name).toBe('Updated Name')
    expect(body.id).toBe('api-id-1')
    expect(sheets.updateSavedApi).toHaveBeenCalledWith('api-id-1', expect.objectContaining({ name: 'Updated Name' }))
  })

  // ===== DELETE =====

  it('delete API returns 204 No Content', async () => {
    jest.mocked(sheets.getSavedApiById).mockResolvedValue(mockApi)

    const res = await apiIdDELETE(makeRequest('DELETE', undefined, authHeader()), withId('api-id-1'))

    expect(res.status).toBe(204)
    expect(sheets.deleteSavedApi).toHaveBeenCalledWith('api-id-1')
    expect(sheets.deleteCallLogsByApi).toHaveBeenCalledWith('api-id-1')
  })

  it('get deleted API returns 404 NOT_FOUND', async () => {
    jest.mocked(sheets.getSavedApiById).mockResolvedValue(null)

    const res = await apiIdGET(makeRequest('GET', undefined, authHeader()), withId('deleted-api-id'))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
  })
})
