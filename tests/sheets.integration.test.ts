// Integration tests against a live staging Supabase database.
// Run with: npm run test:integration
// Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY pointing to a dedicated staging project.
//
// Each test run uses timestamp-based unique IDs so concurrent runs don't collide.
// Users are not deleted after tests (no deleteUser action exists); all other data is cleaned up.

import * as sheets from '@/lib/sheets'
import type { CallLog, SavedApi } from '@/lib/types'

// Increase timeout — Supabase round-trips can still take a few seconds on cold paths
jest.setTimeout(30_000)

const RUN_ID = Date.now()
const userId = `int_user_${RUN_ID}`
const userId2 = `int_user2_${RUN_ID}`
const userId3 = `int_user3_${RUN_ID}`
const email = `int_${RUN_ID}@integration.test`
const email2 = `int2_${RUN_ID}@integration.test`
const email3 = `int3_${RUN_ID}@integration.test`
const apiId = `int_api_${RUN_ID}`
const logId = `int_log_${RUN_ID}`

const today = new Date().toISOString().slice(0, 10)
const yesterday = new Date(Date.now() - 86_400_000).toISOString()

const baseUser = (id: string, userEmail: string, createdAt = new Date().toISOString()) => ({
  id,
  email: userEmail,
  name: 'Integration Test User',
  passwordHash: null,
  googleId: 'google-sub-integration',
  createdAt,
})

const baseApi: SavedApi = {
  id: apiId,
  userId,
  name: 'Integration Test API',
  description: 'Created by integration test',
  model: 'gemma-3-27b-it',
  temperature: 0.7,
  topP: null,
  topK: null,
  maxOutputTokens: 512,
  stopSequences: [],
  safetySettings: [],
  systemPrompt: 'Be helpful.',
  callCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('supabase integration', () => {
  // ===== USER ROUND-TRIP =====

  it('createUser + getUserByEmail round-trip: returned user matches input', async () => {
    const { id } = await sheets.createUser(baseUser(userId, email))
    expect(id).toBe(userId)

    const user = await sheets.getUserByEmail(email)
    expect(user).not.toBeNull()
    expect(user!.id).toBe(userId)
    expect(user!.email).toBe(email)
    expect(user!.tier).toBe('shared')
    expect(user!.totalCallCount).toBe(0)
    expect(user!.dailyCallCount).toBe(0)
  })

  // ===== USER API KEY ROUND-TRIP =====

  it('setApiKey + getApiKey round-trip: encrypted data returned correctly', async () => {
    await sheets.setApiKey({
      userId,
      encryptedKey: 'enc_test_value',
      iv: 'iv_test_value',
      keyHint: 'abcd',
      createdAt: new Date().toISOString(),
      isValid: true,
    })

    const key = await sheets.getApiKey(userId)
    expect(key).not.toBeNull()
    expect(key!.encryptedKey).toBe('enc_test_value')
    expect(key!.iv).toBe('iv_test_value')
    expect(key!.keyHint).toBe('abcd')
  })

  it('deleteApiKey + getApiKey returns null', async () => {
    await sheets.deleteApiKey(userId)
    const key = await sheets.getApiKey(userId)
    expect(key).toBeNull()
  })

  // ===== SAVED API ROUND-TRIP =====

  it('createSavedApi + getSavedApiById round-trip: returned API matches input', async () => {
    await sheets.createSavedApi(baseApi)

    const api = await sheets.getSavedApiById(apiId)
    expect(api).not.toBeNull()
    expect(api!.id).toBe(apiId)
    expect(api!.name).toBe('Integration Test API')
    expect(api!.model).toBe('gemma-3-27b-it')
    expect(api!.temperature).toBe(0.7)
    expect(api!.systemPrompt).toBe('Be helpful.')
    expect(api!.callCount).toBe(0)
  })

  // ===== CALL LOG ROUND-TRIP =====

  it('createCallLog + getCallLogsByApi round-trip: log appears in results', async () => {
    await sheets.createCallLog({
      id: logId,
      savedApiId: apiId,
      userId,
      prompt: 'Integration test prompt',
      responseText: 'Integration test response',
      model: 'gemma-3-27b-it',
      promptTokenCount: 5,
      responseTokenCount: 8,
      totalTokenCount: 13,
      finishReason: 'STOP',
      tier: 'shared',
      latencyMs: 250,
      createdAt: new Date().toISOString(),
    })

    const { calls, total } = await sheets.getCallLogsByApi(apiId, 1, 10)
    expect(total).toBeGreaterThanOrEqual(1)
    const log = calls.find((c: CallLog) => c.id === logId)
    expect(log).toBeDefined()
    expect(log!.prompt).toBe('Integration test prompt')
    expect(log!.totalTokenCount).toBe(13)
  })

  // ===== CALL COUNT INCREMENT =====

  it('incrementApiCallCount increments callCount by 1', async () => {
    const before = await sheets.getSavedApiById(apiId)
    const countBefore = before!.callCount

    await sheets.incrementApiCallCount(apiId)

    const after = await sheets.getSavedApiById(apiId)
    expect(after!.callCount).toBe(countBefore + 1)
  })

  // ===== DELETE CALL LOGS =====

  it('deleteCallLogsByApi removes all logs for the API', async () => {
    await sheets.deleteCallLogsByApi(apiId)

    const { calls, total } = await sheets.getCallLogsByApi(apiId, 1, 10)
    expect(total).toBe(0)
    expect(calls).toHaveLength(0)
  })

  // ===== DELETE SAVED API =====

  it('deleteSavedApi + getSavedApiById returns null', async () => {
    await sheets.deleteSavedApi(apiId)
    const api = await sheets.getSavedApiById(apiId)
    expect(api).toBeNull()
  })

  // ===== CALL COUNTS — SAME DAY =====

  it('incrementCallCounts on same day increments both dailyCallCount and totalCallCount', async () => {
    await sheets.createUser(baseUser(userId2, email2))

    const before = await sheets.getUserQuota(userId2)
    expect(before.dailyCallCount).toBe(0)
    expect(before.totalCallCount).toBe(0)

    await sheets.incrementCallCounts(userId2, today)

    const after = await sheets.getUserQuota(userId2)
    expect(after.dailyCallCount).toBe(1)
    expect(after.totalCallCount).toBe(1)

    // Second call on same day — both keep incrementing
    await sheets.incrementCallCounts(userId2, today)
    const after2 = await sheets.getUserQuota(userId2)
    expect(after2.dailyCallCount).toBe(2)
    expect(after2.totalCallCount).toBe(2)
  })

  // ===== CALL COUNTS — NEW UTC DAY =====

  it('incrementCallCounts on new UTC day resets dailyCallCount to 1', async () => {
    // Create user with yesterday's createdAt so dailyCallResetAt is set to yesterday
    await sheets.createUser(baseUser(userId3, email3, yesterday))

    const before = await sheets.getUserQuota(userId3)
    expect(before.dailyCallCount).toBe(0)

    // Call with today's date — the database function sees a new day and resets
    await sheets.incrementCallCounts(userId3, today)

    const after = await sheets.getUserQuota(userId3)
    expect(after.dailyCallCount).toBe(1)
    expect(after.totalCallCount).toBe(1)
  })
})
