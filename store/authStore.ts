'use client'
// Zustand store: in-memory access token + user profile

export interface UserProfile {
  id: string
  email: string
  name: string
  tier: 'shared' | 'byok'
  totalCallCount: number
  dailyCallCount: number
  dailyLimit: number
  dailyRemaining: number
  hasApiKey: boolean
  keyHint: string | null
}

// Placeholder — implemented in Phase 8
export const useAuthStore = () => {
  throw new Error('Not implemented')
}
