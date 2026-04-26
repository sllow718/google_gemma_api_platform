'use client'

import { create } from 'zustand'
import type { UserProfile } from '@/lib/types'

// Re-export so consumers import from one place
export type { UserProfile }

interface AuthState {
  accessToken: string | null
  user: UserProfile | null
  isLoading: boolean
}

interface AuthActions {
  login(token: string, user: UserProfile): void
  logout(): void
  setToken(token: string): void
  initialize(): Promise<void>
}

export type AuthStore = AuthState & AuthActions

// Module-level timer so it survives re-renders
let _refreshTimer: ReturnType<typeof setTimeout> | null = null

function decodeExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

function scheduleRefresh(getState: () => AuthStore) {
  if (_refreshTimer) clearTimeout(_refreshTimer)
  const token = getState().accessToken
  if (!token) return
  const exp = decodeExp(token)
  if (!exp) return
  const msUntilRefresh = (exp - Math.floor(Date.now() / 1000) - 60) * 1000
  if (msUntilRefresh <= 0) {
    void getState().initialize()
    return
  }
  _refreshTimer = setTimeout(() => void getState().initialize(), msUntilRefresh)
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  accessToken: null,
  user: null,
  isLoading: true,

  login(token, user) {
    set({ accessToken: token, user, isLoading: false })
    scheduleRefresh(get)
  },

  logout() {
    if (_refreshTimer) clearTimeout(_refreshTimer)
    _refreshTimer = null
    set({ accessToken: null, user: null, isLoading: false })
  },

  setToken(token) {
    set({ accessToken: token })
    scheduleRefresh(get)
  },

  async initialize() {
    set({ isLoading: true })
    try {
      const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' })
      if (!refreshRes.ok) {
        set({ accessToken: null, user: null, isLoading: false })
        return
      }
      const { accessToken } = (await refreshRes.json()) as { accessToken: string }

      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!meRes.ok) {
        set({ accessToken: null, user: null, isLoading: false })
        return
      }
      const user = (await meRes.json()) as UserProfile

      set({ accessToken, user, isLoading: false })
      scheduleRefresh(get)
    } catch {
      set({ accessToken: null, user: null, isLoading: false })
    }
  },
}))

// Convenience for non-React contexts (fetch helpers, etc.)
export const getAccessToken = () => useAuthStore.getState().accessToken
