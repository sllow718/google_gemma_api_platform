// Supabase-backed data layer.
//
// The rest of the app still imports this module as `sheets` so the migration
// can stay isolated here while the public API remains stable.

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

type SupabaseRow = Record<string, unknown>

type UserRow = {
  id: string
  email: string
  name: string
  password_hash: string | null
  google_id: string | null
  created_at: string
  last_login_at: string | null
  is_active: boolean
  tier: Tier
  total_call_count: number
  daily_call_count: number
  daily_call_reset_at: string | null
  refresh_token: string | null
  refresh_token_expires_at: string | null
  platform_api_key: string | null
}

type UserApiKeyRow = {
  user_id: string
  encrypted_key: string
  iv: string
  key_hint: string
  created_at: string
  is_valid: boolean
}

type SavedApiRow = {
  id: string
  user_id: string
  name: string
  description: string | null
  model: string
  temperature: number | null
  top_p: number | null
  top_k: number | null
  max_output_tokens: number | null
  stop_sequences: string[]
  safety_settings: Array<{ category: string; threshold: string }>
  system_prompt: string | null
  call_count: number
  created_at: string
  updated_at: string
}

type CallLogRow = {
  id: string
  saved_api_id: string
  user_id: string
  prompt: string
  response_text: string
  model: string
  prompt_token_count: number
  response_token_count: number
  total_token_count: number
  finish_reason: string
  tier: Tier
  latency_ms: number
  created_at: string
}

type SupabaseConfig = {
  baseUrl: string
  serviceRoleKey: string
}

function getSupabaseConfig(): SupabaseConfig {
  const baseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!baseUrl || !serviceRoleKey) {
    throw new SheetsError('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured', 'SHEETS_UNAVAILABLE')
  }

  return { baseUrl, serviceRoleKey }
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const { baseUrl } = getSupabaseConfig()
  const url = new URL(`/rest/v1/${path}`, baseUrl)

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

function baseHeaders(extraHeaders: HeadersInit = {}): Headers {
  const { serviceRoleKey } = getSupabaseConfig()
  const headers = new Headers(extraHeaders)

  headers.set('apikey', serviceRoleKey)
  headers.set('Authorization', `Bearer ${serviceRoleKey}`)
  headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json')

  return headers
}

async function request(
  path: string,
  init: RequestInit = {},
  query?: Record<string, string | number | boolean | undefined>
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(buildUrl(path, query), {
      ...init,
      headers: baseHeaders(init.headers),
      signal: controller.signal,
    })

    if (!response.ok) {
      let details = ''
      try {
        details = await response.text()
      } catch {
        details = ''
      }

      throw new SheetsError(
        details || `Supabase returned HTTP ${response.status}`,
        'SHEETS_UNAVAILABLE'
      )
    }

    return response
  } catch (err) {
    if (err instanceof SheetsError) throw err
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new SheetsError('Supabase did not respond in time', 'SHEETS_UNAVAILABLE')
      }

      throw new SheetsError(`Supabase request failed: ${err.message}`, 'SHEETS_UNAVAILABLE')
    }

    throw new SheetsError('Supabase request failed', 'SHEETS_UNAVAILABLE')
  } finally {
    clearTimeout(timer)
  }
}

async function selectRows<T extends SupabaseRow>(
  table: string,
  query: Record<string, string | number | boolean | undefined>,
  select = '*'
): Promise<T[]> {
  const response = await request(table, { method: 'GET' }, { ...query, select })
  return (await response.json()) as T[]
}

async function selectSingleRow<T extends SupabaseRow>(
  table: string,
  query: Record<string, string | number | boolean | undefined>,
  select = '*'
): Promise<T | null> {
  const rows = await selectRows<T>(table, query, select)
  return rows[0] ?? null
}

async function insertRow<T extends SupabaseRow>(
  table: string,
  row: Record<string, unknown>,
  select = '*'
): Promise<T> {
  const response = await request(
    table,
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(row),
    },
    { select }
  )

  const rows = (await response.json()) as T[]
  return rows[0] as T
}

async function updateRows<T extends SupabaseRow>(
  table: string,
  query: Record<string, string | number | boolean | undefined>,
  patch: Record<string, unknown>,
  select = '*'
): Promise<T[]> {
  const response = await request(
    table,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    },
    { ...query, select }
  )

  return (await response.json()) as T[]
}

async function deleteRows(
  table: string,
  query: Record<string, string | number | boolean | undefined>
): Promise<void> {
  await request(table, { method: 'DELETE' }, query)
}

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const response = await request(
    `rpc/${fn}`,
    {
      method: 'POST',
      body: JSON.stringify(args),
    },
  )

  const text = await response.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    googleId: row.google_id,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    isActive: row.is_active,
    tier: row.tier,
    totalCallCount: row.total_call_count,
    dailyCallCount: row.daily_call_count,
    dailyCallResetAt: row.daily_call_reset_at,
    refreshToken: row.refresh_token,
    refreshTokenExpiresAt: row.refresh_token_expires_at,
    platformApiKey: row.platform_api_key,
  }
}

function toUserApiKey(row: UserApiKeyRow): Omit<UserApiKey, 'userId'> {
  return {
    encryptedKey: row.encrypted_key,
    iv: row.iv,
    keyHint: row.key_hint,
    createdAt: row.created_at,
    isValid: row.is_valid,
  }
}

function toSavedApi(row: SavedApiRow): SavedApi {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? '',
    model: row.model,
    temperature: row.temperature,
    topP: row.top_p,
    topK: row.top_k,
    maxOutputTokens: row.max_output_tokens,
    stopSequences: row.stop_sequences ?? [],
    safetySettings: row.safety_settings ?? [],
    systemPrompt: row.system_prompt ?? '',
    callCount: row.call_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toCallLog(row: CallLogRow): CallLog {
  return {
    id: row.id,
    savedApiId: row.saved_api_id,
    userId: row.user_id,
    prompt: row.prompt,
    responseText: row.response_text,
    model: row.model,
    promptTokenCount: row.prompt_token_count,
    responseTokenCount: row.response_token_count,
    totalTokenCount: row.total_token_count,
    finishReason: row.finish_reason,
    tier: row.tier,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
  }
}

function toUserRow(
  payload: Pick<User, 'id' | 'email' | 'name' | 'createdAt'> & { passwordHash?: string | null; googleId?: string | null }
): Record<string, unknown> {
  return {
    id: payload.id,
    email: payload.email,
    name: payload.name,
    password_hash: payload.passwordHash ?? null,
    google_id: payload.googleId ?? null,
    created_at: payload.createdAt,
    is_active: true,
    tier: 'shared',
    total_call_count: 0,
    daily_call_count: 0,
    daily_call_reset_at: payload.createdAt.slice(0, 10),
  }
}

function toSavedApiRow(api: SavedApi): Record<string, unknown> {
  return {
    id: api.id,
    user_id: api.userId,
    name: api.name,
    description: api.description ?? '',
    model: api.model,
    temperature: api.temperature,
    top_p: api.topP,
    top_k: api.topK,
    max_output_tokens: api.maxOutputTokens,
    stop_sequences: api.stopSequences,
    safety_settings: api.safetySettings,
    system_prompt: api.systemPrompt ?? '',
    call_count: api.callCount,
    created_at: api.createdAt,
    updated_at: api.updatedAt,
  }
}

function toCallLogRow(log: CallLog): Record<string, unknown> {
  return {
    id: log.id,
    saved_api_id: log.savedApiId,
    user_id: log.userId,
    prompt: log.prompt,
    response_text: log.responseText,
    model: log.model,
    prompt_token_count: log.promptTokenCount,
    response_token_count: log.responseTokenCount,
    total_token_count: log.totalTokenCount,
    finish_reason: log.finishReason,
    tier: log.tier,
    latency_ms: log.latencyMs,
    created_at: log.createdAt,
  }
}

function toUserApiKeyRow(payload: Omit<UserApiKey, 'keyHint'> & { keyHint: string }): Record<string, unknown> {
  return {
    user_id: payload.userId,
    encrypted_key: payload.encryptedKey,
    iv: payload.iv,
    key_hint: payload.keyHint,
    created_at: payload.createdAt,
    is_valid: payload.isValid,
  }
}

function buildFilter(key: string, value: string | number | boolean): Record<string, string | number | boolean> {
  return { [key]: `eq.${value}` }
}

function parseContentRange(value: string | null): number | null {
  if (!value) return null
  const match = value.match(/\/(\d+|\*)$/)
  if (!match || match[1] === '*') return null
  return Number(match[1])
}

// ===== USERS =====

export async function createUser(
  payload: Pick<User, 'id' | 'email' | 'name' | 'createdAt'> & { passwordHash?: string | null; googleId?: string | null }
): Promise<{ id: string }> {
  const row = await insertRow<UserRow>('users', toUserRow(payload), 'id')
  return { id: row.id }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const row = await selectSingleRow<UserRow>('users', buildFilter('email', email))
  return row ? toUser(row) : null
}

export async function getUserByGoogleId(googleId: string): Promise<User | null> {
  const row = await selectSingleRow<UserRow>('users', buildFilter('google_id', googleId))
  return row ? toUser(row) : null
}

export async function updateGoogleId(id: string, googleId: string): Promise<void> {
  await updateRows<UserRow>('users', buildFilter('id', id), { google_id: googleId }, 'id')
}

export async function getUserById(id: string): Promise<User | null> {
  const row = await selectSingleRow<UserRow>('users', buildFilter('id', id))
  return row ? toUser(row) : null
}

export async function updateLastLogin(id: string, lastLoginAt: string): Promise<void> {
  await updateRows<UserRow>('users', buildFilter('id', id), { last_login_at: lastLoginAt }, 'id')
}

export async function setRefreshToken(
  id: string,
  refreshToken: string,
  refreshTokenExpiresAt: string
): Promise<void> {
  await updateRows<UserRow>(
    'users',
    buildFilter('id', id),
    { refresh_token: refreshToken, refresh_token_expires_at: refreshTokenExpiresAt },
    'id'
  )
}

export async function getRefreshToken(
  id: string
): Promise<{ refreshToken: string | null; refreshTokenExpiresAt: string | null }> {
  const row = await selectSingleRow<Pick<UserRow, 'refresh_token' | 'refresh_token_expires_at'>>(
    'users',
    buildFilter('id', id),
    'refresh_token,refresh_token_expires_at'
  )

  return {
    refreshToken: row?.refresh_token ?? null,
    refreshTokenExpiresAt: row?.refresh_token_expires_at ?? null,
  }
}

export async function clearRefreshToken(id: string): Promise<void> {
  await updateRows<UserRow>(
    'users',
    buildFilter('id', id),
    { refresh_token: null, refresh_token_expires_at: null },
    'id'
  )
}

export async function updateTier(id: string, tier: Tier): Promise<void> {
  await updateRows<UserRow>('users', buildFilter('id', id), { tier }, 'id')
}

export async function updateUserName(id: string, name: string): Promise<void> {
  await updateRows<UserRow>('users', buildFilter('id', id), { name }, 'id')
}

export async function setPlatformApiKey(id: string, key: string): Promise<void> {
  await updateRows<UserRow>('users', buildFilter('id', id), { platform_api_key: key }, 'id')
}

export async function clearPlatformApiKey(id: string): Promise<void> {
  await updateRows<UserRow>('users', buildFilter('id', id), { platform_api_key: null }, 'id')
}

export async function getUserByPlatformApiKey(key: string): Promise<User | null> {
  const row = await selectSingleRow<UserRow>('users', buildFilter('platform_api_key', key))
  return row ? toUser(row) : null
}

export async function updatePassword(id: string, passwordHash: string): Promise<void> {
  await updateRows<UserRow>('users', buildFilter('id', id), { password_hash: passwordHash }, 'id')
}

export async function incrementCallCounts(id: string, currentDate: string): Promise<void> {
  await callRpc<void>('increment_call_counts', {
    p_user_id: id,
    p_current_date: currentDate,
  })
}

export async function getUserQuota(
  id: string
): Promise<{ dailyCallCount: number; dailyCallResetAt: string | null; totalCallCount: number; tier: Tier }> {
  const row = await selectSingleRow<UserRow>(
    'users',
    buildFilter('id', id),
    'tier,daily_call_count,daily_call_reset_at,total_call_count'
  )

  if (!row) {
    throw new SheetsError('User not found', 'SHEETS_UNAVAILABLE')
  }

  return {
    dailyCallCount: row.daily_call_count,
    dailyCallResetAt: row.daily_call_reset_at,
    totalCallCount: row.total_call_count,
    tier: row.tier,
  }
}

// ===== USER API KEYS =====

export async function setApiKey(
  payload: Omit<UserApiKey, 'keyHint'> & { keyHint: string }
): Promise<void> {
  const row = toUserApiKeyRow(payload)
  const existing = await selectSingleRow<UserApiKeyRow>(
    'user_api_keys',
    buildFilter('user_id', payload.userId),
    'user_id'
  )

  if (existing) {
    await updateRows<UserApiKeyRow>('user_api_keys', buildFilter('user_id', payload.userId), row, 'user_id')
    return
  }

  await insertRow<UserApiKeyRow>('user_api_keys', row, 'user_id')
}

export async function getApiKey(userId: string): Promise<Omit<UserApiKey, 'userId'> | null> {
  const row = await selectSingleRow<UserApiKeyRow>('user_api_keys', buildFilter('user_id', userId))
  return row ? toUserApiKey(row) : null
}

export async function deleteApiKey(userId: string): Promise<void> {
  await deleteRows('user_api_keys', buildFilter('user_id', userId))
}

// ===== SAVED APIS =====

export async function createSavedApi(api: SavedApi): Promise<{ id: string }> {
  const row = await insertRow<SavedApiRow>('saved_apis', toSavedApiRow(api), 'id')
  return { id: row.id }
}

export async function getSavedApisByUser(userId: string): Promise<SavedApi[]> {
  const rows = await selectRows<SavedApiRow>(
    'saved_apis',
    { user_id: `eq.${userId}`, order: 'created_at.desc' },
    '*'
  )
  return rows.map(toSavedApi)
}

export async function getSavedApiById(id: string): Promise<SavedApi | null> {
  const row = await selectSingleRow<SavedApiRow>('saved_apis', buildFilter('id', id))
  return row ? toSavedApi(row) : null
}

export async function updateSavedApi(
  id: string,
  fields: Partial<Omit<SavedApi, 'id' | 'userId' | 'callCount' | 'createdAt'>> & { updatedAt: string }
): Promise<void> {
  const patch: Record<string, unknown> = {
    updated_at: fields.updatedAt,
  }

  if (fields.name !== undefined) patch.name = fields.name
  if (fields.description !== undefined) patch.description = fields.description
  if (fields.model !== undefined) patch.model = fields.model
  if (fields.temperature !== undefined) patch.temperature = fields.temperature
  if (fields.topP !== undefined) patch.top_p = fields.topP
  if (fields.topK !== undefined) patch.top_k = fields.topK
  if (fields.maxOutputTokens !== undefined) patch.max_output_tokens = fields.maxOutputTokens
  if (fields.stopSequences !== undefined) patch.stop_sequences = fields.stopSequences
  if (fields.safetySettings !== undefined) patch.safety_settings = fields.safetySettings
  if (fields.systemPrompt !== undefined) patch.system_prompt = fields.systemPrompt

  await updateRows<SavedApiRow>('saved_apis', buildFilter('id', id), patch, 'id')
}

export async function deleteSavedApi(id: string): Promise<void> {
  await deleteRows('saved_apis', buildFilter('id', id))
}

export async function incrementApiCallCount(id: string): Promise<void> {
  await callRpc<void>('increment_api_call_count', { p_api_id: id })
}

// ===== CALL LOGS =====

export async function createCallLog(log: CallLog): Promise<{ id: string }> {
  const row = await insertRow<CallLogRow>('call_logs', toCallLogRow(log), 'id')
  return { id: row.id }
}

export async function getCallLogsByApi(
  savedApiId: string,
  page: number,
  limit: number
): Promise<{ calls: CallLog[]; total: number }> {
  const start = Math.max(0, (page - 1) * limit)
  const end = start + limit - 1
  const response = await request(
    'call_logs',
    {
      method: 'GET',
      headers: {
        Prefer: 'count=exact',
        'Range-Unit': 'items',
        Range: `${start}-${end}`,
      },
    },
    { saved_api_id: `eq.${savedApiId}`, order: 'created_at.desc', select: '*' }
  )

  const rows = (await response.json()) as CallLogRow[]
  const total = parseContentRange(response.headers.get('content-range')) ?? rows.length
  return { calls: rows.map(toCallLog), total }
}

export async function deleteCallLogsByApi(savedApiId: string): Promise<void> {
  await deleteRows('call_logs', buildFilter('saved_api_id', savedApiId))
}
