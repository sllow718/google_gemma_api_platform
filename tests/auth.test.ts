import { POST as refreshPOST } from '@/app/api/auth/refresh/route'
import { POST as logoutPOST } from '@/app/api/auth/logout/route'
import { GET as meGET } from '@/app/api/auth/me/route'
import { signAccessToken } from '@/lib/auth'
import type { User } from '@/lib/types'
import * as sheets from '@/lib/sheets'
import jwt from 'jsonwebtoken'

jest.mock('@/lib/sheets')
jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('mock-uuid-1234') }))

const mockGet = jest.fn()
const mockSet = jest.fn()

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))

const mockUser: User = {
  id: 'user-id-1',
  email: 'test@example.com',
  name: 'Test User',
  passwordHash: null,
  googleId: 'google-sub-123',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: '2026-01-01T00:00:00.000Z',
  isActive: true,
  tier: 'shared',
  totalCallCount: 10,
  dailyCallCount: 2,
  dailyCallResetAt: '2026-01-01T00:00:00.000Z',
  refreshToken: 'stored-refresh-token',
  refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  platformApiKey: null,
}

function makeRequest(method: string, body?: unknown, headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/test', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('auth routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    const { cookies } = jest.requireMock('next/headers')
    cookies.mockResolvedValue({ get: mockGet, set: mockSet })
    mockGet.mockReturnValue(undefined)
    jest.mocked(sheets.getRefreshToken).mockResolvedValue({
      refreshToken: null,
      refreshTokenExpiresAt: null,
    })
    jest.mocked(sheets.getUserById).mockResolvedValue(null)
    jest.mocked(sheets.getApiKey).mockResolvedValue(null)
    jest.mocked(sheets.setRefreshToken).mockResolvedValue(undefined)
    jest.mocked(sheets.clearRefreshToken).mockResolvedValue(undefined)
  })

  // ===== ME =====

  it('GET /api/auth/me with valid token returns 200 with profile', async () => {
    jest.mocked(sheets.getUserById).mockResolvedValue(mockUser)

    const token = signAccessToken({ sub: mockUser.id, email: mockUser.email, tier: mockUser.tier })
    const res = await meGET(makeRequest('GET', undefined, { Authorization: `Bearer ${token}` }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.id).toBe(mockUser.id)
    expect(body.email).toBe(mockUser.email)
    expect(body.name).toBe(mockUser.name)
    expect(body.tier).toBe('shared')
    expect(typeof body.dailyLimit).toBe('number')
    expect(typeof body.dailyRemaining).toBe('number')
    expect(body.hasApiKey).toBe(false)
  })

  it('GET /api/auth/me with expired token returns 401 UNAUTHORIZED', async () => {
    const expiredToken = jwt.sign(
      { sub: 'user-id', email: 'test@example.com', tier: 'shared', exp: Math.floor(Date.now() / 1000) - 3600 },
      process.env.JWT_SECRET!
    )
    const res = await meGET(makeRequest('GET', undefined, { Authorization: `Bearer ${expiredToken}` }))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  // ===== REFRESH =====

  it('POST /api/auth/refresh with valid cookie returns 200 with new accessToken', async () => {
    const futureExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    mockGet.mockReturnValue({ value: `${mockUser.id}:stored-refresh-token` })
    jest.mocked(sheets.getRefreshToken).mockResolvedValue({
      refreshToken: 'stored-refresh-token',
      refreshTokenExpiresAt: futureExpiry,
    })
    jest.mocked(sheets.getUserById).mockResolvedValue(mockUser)

    const res = await refreshPOST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(typeof body.accessToken).toBe('string')
    expect(mockSet).toHaveBeenCalledWith(
      'refreshToken',
      expect.stringContaining(':'),
      expect.objectContaining({ httpOnly: true })
    )
  })

  it('POST /api/auth/refresh with missing cookie returns 401 REFRESH_TOKEN_INVALID', async () => {
    mockGet.mockReturnValue(undefined)

    const res = await refreshPOST()
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error.code).toBe('REFRESH_TOKEN_INVALID')
  })

  // ===== LOGOUT =====

  it('POST /api/auth/logout clears cookie and returns 200', async () => {
    mockGet.mockReturnValue({ value: `${mockUser.id}:stored-refresh-token` })

    const res = await logoutPOST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(sheets.clearRefreshToken).toHaveBeenCalledWith(mockUser.id)
    expect(mockSet).toHaveBeenCalledWith('refreshToken', '', expect.objectContaining({ maxAge: 0 }))
  })
})
