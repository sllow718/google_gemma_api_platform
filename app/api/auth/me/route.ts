import { NextResponse } from 'next/server'
import { verifyAccessToken } from '@/lib/auth'
import { getUserById, getApiKey } from '@/lib/sheets'

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  let payload: ReturnType<typeof verifyAccessToken>
  try {
    payload = verifyAccessToken(auth.slice(7))
  } catch {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const [user, apiKey] = await Promise.all([getUserById(payload.sub), getApiKey(payload.sub)])

  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const dailyLimit = parseInt(process.env.SHARED_TIER_DAILY_LIMIT ?? '50', 10)

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    tier: user.tier,
    totalCallCount: user.totalCallCount,
    dailyCallCount: user.dailyCallCount,
    dailyLimit: user.tier === 'shared' ? dailyLimit : null,
    dailyRemaining: user.tier === 'shared' ? Math.max(0, dailyLimit - user.dailyCallCount) : null,
    hasApiKey: !!apiKey,
    keyHint: apiKey?.keyHint ?? null,
    platformApiKey: user.platformApiKey ?? null,
  })
}
