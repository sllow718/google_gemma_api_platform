import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { LoginSchema } from '@/lib/validate'
import { signAccessToken, generateRefreshToken, setRefreshCookie } from '@/lib/auth'
import { getUserByEmail, updateLastLogin, setRefreshToken } from '@/lib/sheets'

const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON' } }, { status: 400 })
  }

  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() } }, { status: 400 })
  }

  const { email, password } = parsed.data

  const user = await getUserByEmail(email)
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }, { status: 401 })
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }, { status: 401 })
  }

  const now = new Date().toISOString()
  const refreshToken = generateRefreshToken()
  const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS).toISOString()

  await Promise.all([
    updateLastLogin(user.id, now),
    setRefreshToken(user.id, refreshToken, refreshTokenExpiresAt),
  ])
  await setRefreshCookie(user.id, refreshToken)

  const accessToken = signAccessToken({ sub: user.id, email: user.email, tier: user.tier })

  return NextResponse.json({
    accessToken,
    user: { id: user.id, email: user.email, name: user.name, tier: user.tier },
  })
}
