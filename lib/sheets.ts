// Apps Script HTTP client
// All Vercel functions call this module; it never exposes raw sheet URLs or secrets.
//
// NOTE: Apps Script Web Apps cannot read HTTP headers. The SHEETS_SECRET is
// passed as `body.secret` in every request rather than an X-Sheets-Secret header.

import type { CallLog, SavedApi, Tier, User, UserApiKey } from './types'

const TIMEOUT_MS = 25_000

class SheetsError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message)
    this.name = 'SheetsError'
  }
}

async function sheetsRequest<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const url = process.env.SHEETS_WEBHOOK_URL
  const secret = process.env.SHEETS_SECRET

  if (!url || !secret) {
    throw new SheetsError('SHEETS_WEBHOOK_URL or SHEETS_SECRET not configured', 'SHEETS_UNAVAILABLE')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, secret, ...payload }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new SheetsError(`Apps Script returned HTTP ${res.status}`, 'SHEETS_UNAVAILABLE')
    }

    const data = (await res.json()) as T & { success: boolean; error?: string }

    if (!(data as { success: boolean }).success) {
      const errMsg = (data as { error?: string }).error ?? 'Unknown sheets error'
      throw new SheetsError(errMsg, errMsg === 'Unauthorized' ? 'SHEETS_UNAUTHORIZED' : 'SHEETS_ERROR')
    }

    return data
  } catch (err) {
    if (err instanceof SheetsError) throw err
    throw new SheetsError('Apps Script did not respond in time', 'SHEETS_UNAVAILABLE')
  } finally {
    clearTimeout(timer)
  }
}

// ===== USERS =====

export async function createUser(
  payload: Pick<User, 'id' | 'email' | 'name' | 'passwordHash' | 'createdAt'>
): Promise<{ id: string }> {
  return sheetsRequest('createUser', payload as Record<string, unknown>)
}

export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const res = await sheetsRequest<{ user: User }>('getUserByEmail', { email })
    return res.user
  } catch (err) {
    if (err instanceof SheetsError && err.code === 'SHEETS_ERROR') return null
    throw err
  }
}

export async function getUserById(id: string): Promise<User | null> {
  try {
    const res = await sheetsRequest<{ user: User }>('getUserById', { id })
    return res.user
  } catch (err) {
    if (err instanceof SheetsError && err.code === 'SHEETS_ERROR') return null
    throw err
  }
}

export async function updateLastLogin(id: string, lastLoginAt: string): Promise<void> {
  await sheetsRequest('updateLastLogin', { id, lastLoginAt })
}

export async function setRefreshToken(
  id: string,
  refreshToken: string,
  refreshTokenExpiresAt: string
): Promise<void> {
  await sheetsRequest('setRefreshToken', { id, refreshToken, refreshTokenExpiresAt })
}

export async function getRefreshToken(
  id: string
): Promise<{ refreshToken: string | null; refreshTokenExpiresAt: string | null }> {
  return sheetsRequest('getRefreshToken', { id })
}

export async function clearRefreshToken(id: string): Promise<void> {
  await sheetsRequest('clearRefreshToken', { id })
}

export async function updateTier(id: string, tier: Tier): Promise<void> {
  await sheetsRequest('updateTier', { id, tier })
}

export async function updateUserName(id: string, name: string): Promise<void> {
  await sheetsRequest('updateUserName', { id, name })
}

export async function setPlatformApiKey(id: string, key: string): Promise<void> {
  await sheetsRequest('setPlatformApiKey', { id, key })
}

export async function clearPlatformApiKey(id: string): Promise<void> {
  await sheetsRequest('clearPlatformApiKey', { id })
}

export async function getUserByPlatformApiKey(key: string): Promise<User | null> {
  try {
    const res = await sheetsRequest<{ user: User }>('getUserByPlatformApiKey', { key })
    return res.user
  } catch (err) {
    if (err instanceof SheetsError && err.code === 'SHEETS_ERROR') return null
    throw err
  }
}

export async function updatePassword(id: string, passwordHash: string): Promise<void> {
  await sheetsRequest('updatePassword', { id, passwordHash })
}

export async function incrementCallCounts(id: string, currentDate: string): Promise<void> {
  await sheetsRequest('incrementCallCounts', { id, currentDate })
}

export async function getUserQuota(
  id: string
): Promise<{ dailyCallCount: number; dailyCallResetAt: string | null; totalCallCount: number; tier: Tier }> {
  return sheetsRequest('getUserQuota', { id })
}

// ===== USER API KEYS =====

export async function setApiKey(
  payload: Omit<UserApiKey, 'keyHint'> & { keyHint: string }
): Promise<void> {
  await sheetsRequest('setApiKey', payload as Record<string, unknown>)
}

export async function getApiKey(userId: string): Promise<Omit<UserApiKey, 'userId'> | null> {
  try {
    const res = await sheetsRequest<Omit<UserApiKey, 'userId'>>('getApiKey', { userId })
    return res
  } catch (err) {
    if (err instanceof SheetsError && err.code === 'SHEETS_ERROR') return null
    throw err
  }
}

export async function deleteApiKey(userId: string): Promise<void> {
  await sheetsRequest('deleteApiKey', { userId })
}

// ===== SAVED APIS =====

export async function createSavedApi(api: SavedApi): Promise<{ id: string }> {
  return sheetsRequest('createSavedApi', api as unknown as Record<string, unknown>)
}

export async function getSavedApisByUser(userId: string): Promise<SavedApi[]> {
  const res = await sheetsRequest<{ apis: SavedApi[] }>('getSavedApisByUser', { userId })
  return res.apis
}

export async function getSavedApiById(id: string): Promise<SavedApi | null> {
  try {
    const res = await sheetsRequest<{ api: SavedApi }>('getSavedApiById', { id })
    return res.api
  } catch (err) {
    if (err instanceof SheetsError && err.code === 'SHEETS_ERROR') return null
    throw err
  }
}

export async function updateSavedApi(
  id: string,
  fields: Partial<Omit<SavedApi, 'id' | 'userId' | 'callCount' | 'createdAt'>> & { updatedAt: string }
): Promise<void> {
  await sheetsRequest('updateSavedApi', { id, ...fields } as Record<string, unknown>)
}

export async function deleteSavedApi(id: string): Promise<void> {
  await sheetsRequest('deleteSavedApi', { id })
}

export async function incrementApiCallCount(id: string): Promise<void> {
  await sheetsRequest('incrementApiCallCount', { id })
}

// ===== CALL LOGS =====

export async function createCallLog(log: CallLog): Promise<{ id: string }> {
  return sheetsRequest('createCallLog', log as unknown as Record<string, unknown>)
}

export async function getCallLogsByApi(
  savedApiId: string,
  page: number,
  limit: number
): Promise<{ calls: CallLog[]; total: number }> {
  return sheetsRequest('getCallLogsByApi', { savedApiId, page, limit })
}

export async function deleteCallLogsByApi(savedApiId: string): Promise<void> {
  await sheetsRequest('deleteCallLogsByApi', { savedApiId })
}
