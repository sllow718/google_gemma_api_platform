// Shared data model types — mirrors the Google Sheets schema in Requirements §5

export type Tier = 'shared' | 'byok'

export interface User {
  id: string
  email: string
  name: string
  passwordHash: string | null
  googleId: string | null
  createdAt: string
  lastLoginAt: string | null
  isActive: boolean
  tier: Tier
  totalCallCount: number
  dailyCallCount: number
  dailyCallResetAt: string | null
  refreshToken: string | null
  refreshTokenExpiresAt: string | null
  platformApiKey: string | null
}

export interface UserApiKey {
  userId: string
  encryptedKey: string
  iv: string
  keyHint: string
  createdAt: string
  isValid: boolean
}

export interface SafetySetting {
  category: string
  threshold: string
}

export interface SavedApi {
  id: string
  userId: string
  name: string
  description: string | null
  model: string
  temperature: number | null
  topP: number | null
  topK: number | null
  maxOutputTokens: number | null
  stopSequences: string[]
  safetySettings: SafetySetting[]
  systemPrompt: string | null
  callCount: number
  createdAt: string
  updatedAt: string
}

export interface CallLog {
  id: string
  savedApiId: string
  userId: string
  prompt: string
  responseText: string
  model: string
  promptTokenCount: number
  responseTokenCount: number
  totalTokenCount: number
  finishReason: string
  tier: Tier
  latencyMs: number
  createdAt: string
}

// Quota/profile shape returned by GET /api/auth/me
export interface UserProfile {
  id: string
  email: string
  name: string
  tier: Tier
  totalCallCount: number
  dailyCallCount: number
  dailyLimit: number
  dailyRemaining: number
  hasApiKey: boolean
  keyHint: string | null
  platformApiKey: string | null
}
