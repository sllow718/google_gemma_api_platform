import { PATCH as profilePATCH } from '@/app/api/user/profile/route'
import { POST as passwordPOST } from '@/app/api/user/password/route'
import { signAccessToken } from '@/lib/auth'
import type { User } from '@/lib/types'
import * as sheets from '@/lib/sheets'
import * as bcryptjs from 'bcryptjs'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('mock-uuid') }))
jest.mock('@/lib/sheets')
jest.mock('bcryptjs')

const USER_ID = 'user-id-1'

const mockUser: User = {
  id: USER_ID,
  email: 'test@example.com',
  name: 'Test User',
  passwordHash: '$2b$12$hashedpassword',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: null,
  isActive: true,
  tier: 'shared',
  totalCallCount: 0,
  dailyCallCount: 0,
  dailyCallResetAt: null,
  refreshToken: null,
  refreshTokenExpiresAt: null,
}

function makeRequest(method: string, body?: unknown): Request {
  const token = signAccessToken({ sub: USER_ID, email: mockUser.email, tier: 'shared' })
  return new Request('http://localhost', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function unauthRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('PATCH /api/user/profile', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(sheets.updateUserName).mockResolvedValue(undefined)
  })

  it('updates display name and returns new name', async () => {
    const res = await profilePATCH(makeRequest('PATCH', { name: 'New Name' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.name).toBe('New Name')
    expect(sheets.updateUserName).toHaveBeenCalledWith(USER_ID, 'New Name')
  })

  it('returns 400 VALIDATION_ERROR for empty name', async () => {
    const res = await profilePATCH(makeRequest('PATCH', { name: '' }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(sheets.updateUserName).not.toHaveBeenCalled()
  })

  it('returns 401 UNAUTHORIZED without auth token', async () => {
    const res = await profilePATCH(unauthRequest('PATCH', { name: 'New Name' }))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })
})

describe('POST /api/user/password', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(sheets.getUserById).mockResolvedValue(mockUser)
    jest.mocked(bcryptjs.compare).mockResolvedValue(true as never)
    jest.mocked(bcryptjs.hash).mockResolvedValue('$2b$12$newhash' as never)
    jest.mocked(sheets.updatePassword).mockResolvedValue(undefined)
  })

  it('changes password with correct current password', async () => {
    const res = await passwordPOST(makeRequest('POST', {
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass1!',
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(sheets.updatePassword).toHaveBeenCalledWith(USER_ID, '$2b$12$newhash')
  })

  it('returns 400 WRONG_PASSWORD when current password is incorrect', async () => {
    jest.mocked(bcryptjs.compare).mockResolvedValue(false as never)

    const res = await passwordPOST(makeRequest('POST', {
      currentPassword: 'WrongPass1!',
      newPassword: 'NewPass1!',
    }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('WRONG_PASSWORD')
    expect(sheets.updatePassword).not.toHaveBeenCalled()
  })

  it('returns 400 VALIDATION_ERROR for weak new password', async () => {
    const res = await passwordPOST(makeRequest('POST', {
      currentPassword: 'OldPass1!',
      newPassword: 'weak',
    }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(sheets.updatePassword).not.toHaveBeenCalled()
  })

  it('returns 401 UNAUTHORIZED without auth token', async () => {
    const res = await passwordPOST(unauthRequest('POST', {
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass1!',
    }))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })
})
