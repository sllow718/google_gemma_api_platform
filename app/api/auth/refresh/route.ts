import { NextResponse } from 'next/server'
import { signAccessToken, generateRefreshToken, getRefreshCookie, setRefreshCookie } from '@/lib/auth'
import { getRefreshToken, getUserById, setRefreshToken } from '@/lib/sheets'

const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000
const INVALID = { error: { code: 'REFRESH_TOKEN_INVALID' } } as const

export async function POST(): Promise<Response> {
  const cookie = await getRefreshCookie()
  if (!cookie) {
    return NextResponse.json(INVALID, { status: 401 })
  }

  const { userId, token } = cookie

  const stored = await getRefreshToken(userId).catch(() => null)
  if (!stored || stored.refreshToken !== token) {
    return NextResponse.json(INVALID, { status: 401 })
  }

  if (stored.refreshTokenExpiresAt && new Date(stored.refreshTokenExpiresAt) < new Date()) {
    return NextResponse.json(INVALID, { status: 401 })
  }

  const user = await getUserById(userId)
  if (!user) {
    return NextResponse.json(INVALID, { status: 401 })
  }

  const newToken = generateRefreshToken()
  const newExpiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS).toISOString()
  await setRefreshToken(userId, newToken, newExpiresAt)
  await setRefreshCookie(userId, newToken)

  const accessToken = signAccessToken({ sub: userId, email: user.email, tier: user.tier })
  return NextResponse.json({ accessToken })
}
