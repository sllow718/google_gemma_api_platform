import { useAuthStore } from '@/store/authStore'
import type { UserProfile } from '@/lib/types'

// Reset store state and timers between tests
const initialState = { accessToken: null, user: null, isLoading: true }

const mockUser: UserProfile = {
  id: 'user-id-1',
  email: 'test@example.com',
  name: 'Test User',
  tier: 'shared',
  totalCallCount: 5,
  dailyCallCount: 2,
  dailyLimit: 50,
  dailyRemaining: 48,
  hasApiKey: false,
  keyHint: null,
}

// A minimal JWT with exp 15 minutes from now
function makeToken(expOffsetSec = 900): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({ sub: 'user-id-1', exp: Math.floor(Date.now() / 1000) + expOffsetSec }))
  return `${header}.${payload}.sig`
}

function mockFetch(responses: { ok: boolean; body: unknown }[]) {
  let call = 0
  global.fetch = jest.fn().mockImplementation(() => {
    const r = responses[call++] ?? responses[responses.length - 1]
    return Promise.resolve({ ok: r.ok, json: () => Promise.resolve(r.body) } as Response)
  })
}

beforeEach(() => {
  jest.useFakeTimers()
  useAuthStore.setState({ ...initialState })
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('authStore', () => {
  describe('initialize()', () => {
    it('on successful refresh sets accessToken, user, and isLoading=false', async () => {
      const token = makeToken()
      mockFetch([
        { ok: true, body: { accessToken: token } },
        { ok: true, body: mockUser },
      ])

      await useAuthStore.getState().initialize()
      const state = useAuthStore.getState()

      expect(state.accessToken).toBe(token)
      expect(state.user).toEqual(mockUser)
      expect(state.isLoading).toBe(false)
    })

    it('when refresh returns 401 sets null state and isLoading=false', async () => {
      mockFetch([{ ok: false, body: { error: { code: 'REFRESH_TOKEN_INVALID' } } }])

      await useAuthStore.getState().initialize()
      const state = useAuthStore.getState()

      expect(state.accessToken).toBeNull()
      expect(state.user).toBeNull()
      expect(state.isLoading).toBe(false)
    })

    it('when /api/auth/me fails clears state', async () => {
      mockFetch([
        { ok: true, body: { accessToken: makeToken() } },
        { ok: false, body: { error: { code: 'UNAUTHORIZED' } } },
      ])

      await useAuthStore.getState().initialize()
      const state = useAuthStore.getState()

      expect(state.accessToken).toBeNull()
      expect(state.user).toBeNull()
    })

    it('when fetch throws clears state', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

      await useAuthStore.getState().initialize()
      const state = useAuthStore.getState()

      expect(state.accessToken).toBeNull()
      expect(state.isLoading).toBe(false)
    })

    it('schedules a background refresh before token expiry', async () => {
      const token = makeToken(900) // 15 min
      mockFetch([
        { ok: true, body: { accessToken: token } },
        { ok: true, body: mockUser },
      ])

      await useAuthStore.getState().initialize()

      expect(jest.getTimerCount()).toBeGreaterThan(0)
    })
  })

  describe('login()', () => {
    it('sets accessToken and user, clears isLoading', () => {
      const token = makeToken()
      useAuthStore.getState().login(token, mockUser)
      const state = useAuthStore.getState()

      expect(state.accessToken).toBe(token)
      expect(state.user).toEqual(mockUser)
      expect(state.isLoading).toBe(false)
    })
  })

  describe('logout()', () => {
    it('clears accessToken and user', () => {
      useAuthStore.setState({ accessToken: makeToken(), user: mockUser, isLoading: false })

      useAuthStore.getState().logout()
      const state = useAuthStore.getState()

      expect(state.accessToken).toBeNull()
      expect(state.user).toBeNull()
      expect(state.isLoading).toBe(false)
    })

    it('cancels any pending refresh timer', () => {
      useAuthStore.getState().login(makeToken(), mockUser)
      expect(jest.getTimerCount()).toBeGreaterThan(0)

      useAuthStore.getState().logout()
      expect(jest.getTimerCount()).toBe(0)
    })
  })

  describe('setToken()', () => {
    it('updates accessToken without changing user', () => {
      useAuthStore.setState({ accessToken: null, user: mockUser, isLoading: false })
      const newToken = makeToken()

      useAuthStore.getState().setToken(newToken)

      expect(useAuthStore.getState().accessToken).toBe(newToken)
      expect(useAuthStore.getState().user).toEqual(mockUser)
    })
  })
})
