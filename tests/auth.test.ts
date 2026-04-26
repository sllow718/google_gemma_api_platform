import { POST as signupPOST } from '@/app/api/auth/signup/route'
import { POST as loginPOST } from '@/app/api/auth/login/route'
import { POST as refreshPOST } from '@/app/api/auth/refresh/route'
import { POST as logoutPOST } from '@/app/api/auth/logout/route'
import { GET as meGET } from '@/app/api/auth/me/route'
import { signAccessToken } from '@/lib/auth'
import type { User } from '@/lib/types'
import * as sheets from '@/lib/sheets'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

jest.mock('@/lib/sheets')
jest.mock('bcryptjs')
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
  passwordHash: '$2b$12$hashedpassword',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: '2026-01-01T00:00:00.000Z',
  isActive: true,
  tier: 'shared',
  totalCallCount: 10,
  dailyCallCount: 2,
  dailyCallResetAt: '2026-01-01T00:00:00.000Z',
  refreshToken: 'stored-refresh-token',
  refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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
    jest.mocked(sheets.getUserByEmail).mockResolvedValue(null)
    jest.mocked(sheets.createUser).mockResolvedValue({ id: 'mock-uuid-1234' })
    jest.mocked(sheets.setRefreshToken).mockResolvedValue(undefined)
    jest.mocked(sheets.updateLastLogin).mockResolvedValue(undefined)
    jest.mocked(sheets.getRefreshToken).mockResolvedValue({
      refreshToken: null,
      refreshTokenExpiresAt: null,
    })
    jest.mocked(sheets.getUserById).mockResolvedValue(null)
    jest.mocked(sheets.getApiKey).mockResolvedValue(null)
    jest.mocked(sheets.clearRefreshToken).mockResolvedValue(undefined)
    jest.mocked(bcrypt.hash).mockResolvedValue('$2b$12$hashedpassword' as never)
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never)
  })

  // ===== SIGNUP =====

  it('signup with valid data returns 201 with accessToken and sets cookie', async () => {
    const res = await signupPOST(
      makeRequest('POST', { email: 'new@example.com', password: 'StrongPass1!', name: 'New User' })
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(typeof body.accessToken).toBe('string')
    expect(body.user).toMatchObject({ email: 'new@example.com', name: 'New User', tier: 'shared' })
    expect(mockSet).toHaveBeenCalledWith(
      'refreshToken',
      expect.stringContaining(':'),
      expect.objectContaining({ httpOnly: true })
    )
  })

  it('signup with duplicate email returns 409 CONFLICT', async () => {
    jest.mocked(sheets.getUserByEmail).mockResolvedValue(mockUser)

    const res = await signupPOST(
      makeRequest('POST', { email: 'test@example.com', password: 'StrongPass1!', name: 'Test' })
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe('CONFLICT')
  })

  it('signup with weak password returns 400 VALIDATION_ERROR', async () => {
    const res = await signupPOST(
      makeRequest('POST', { email: 'new@example.com', password: 'weak', name: 'Test' })
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  // ===== LOGIN =====

  it('login with correct credentials returns 200 with accessToken and sets cookie', async () => {
    jest.mocked(sheets.getUserByEmail).mockResolvedValue(mockUser)

    const res = await loginPOST(
      makeRequest('POST', { email: 'test@example.com', password: 'CorrectPass1!' })
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(typeof body.accessToken).toBe('string')
    expect(body.user).toMatchObject({ email: 'test@example.com', tier: 'shared' })
    expect(mockSet).toHaveBeenCalledWith(
      'refreshToken',
      expect.stringContaining(':'),
      expect.objectContaining({ httpOnly: true })
    )
  })

  it('login with wrong password returns 401 UNAUTHORIZED', async () => {
    jest.mocked(sheets.getUserByEmail).mockResolvedValue(mockUser)
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never)

    const res = await loginPOST(
      makeRequest('POST', { email: 'test@example.com', password: 'WrongPass1!' })
    )
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
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
