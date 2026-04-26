import { POST, DELETE } from '@/app/api/user/platformkey/route'
import { signAccessToken } from '@/lib/auth'
import * as sheets from '@/lib/sheets'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('aaaabbbb-cccc-dddd-eeee-ffff00001111') }))
jest.mock('@/lib/sheets')

const USER_ID = 'user-id-1'

function authRequest(method: string): Request {
  const token = signAccessToken({ sub: USER_ID, email: 'test@example.com', tier: 'shared' })
  return new Request('http://localhost/api/user/platformkey', {
    method,
    headers: { Authorization: `Bearer ${token}` },
  })
}

describe('POST /api/user/platformkey', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(sheets.setPlatformApiKey).mockResolvedValue(undefined)
  })

  it('generates a key with gmp_ prefix and stores it', async () => {
    const res = await POST(authRequest('POST'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.platformApiKey).toMatch(/^gmp_[a-f0-9]{32}$/)
    expect(sheets.setPlatformApiKey).toHaveBeenCalledWith(USER_ID, body.platformApiKey)
  })

  it('overwrites existing key and returns new key', async () => {
    const res1 = await POST(authRequest('POST'))
    const res2 = await POST(authRequest('POST'))
    const body2 = await res2.json()

    expect(res2.status).toBe(200)
    expect(body2.platformApiKey).toMatch(/^gmp_/)
    expect(sheets.setPlatformApiKey).toHaveBeenCalledTimes(2)
  })

  it('returns 401 UNAUTHORIZED without auth token', async () => {
    const res = await POST(new Request('http://localhost/api/user/platformkey', { method: 'POST' }))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })
})

describe('DELETE /api/user/platformkey', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(sheets.clearPlatformApiKey).mockResolvedValue(undefined)
  })

  it('clears the platform API key', async () => {
    const res = await DELETE(authRequest('DELETE'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(sheets.clearPlatformApiKey).toHaveBeenCalledWith(USER_ID)
  })

  it('returns 401 UNAUTHORIZED without auth token', async () => {
    const res = await DELETE(new Request('http://localhost/api/user/platformkey', { method: 'DELETE' }))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })
})
