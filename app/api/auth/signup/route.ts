import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { SignupSchema } from '@/lib/validate'
import { signAccessToken, generateRefreshToken, setRefreshCookie } from '@/lib/auth'
import { getUserByEmail, createUser, setRefreshToken } from '@/lib/sheets'

const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON' } }, { status: 400 })
  }

  const parsed = SignupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() } }, { status: 400 })
  }

  const { email, password, name } = parsed.data

  const existing = await getUserByEmail(email)
  if (existing) {
    return NextResponse.json({ error: { code: 'CONFLICT', message: 'Email already registered' } }, { status: 409 })
  }

  const [passwordHash, userId] = await Promise.all([
    bcrypt.hash(password, 12),
    Promise.resolve(uuidv4()),
  ])

  const now = new Date().toISOString()
  await createUser({ id: userId, email, name, passwordHash, createdAt: now })

  const refreshToken = generateRefreshToken()
  const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS).toISOString()
  await setRefreshToken(userId, refreshToken, refreshTokenExpiresAt)
  await setRefreshCookie(userId, refreshToken)

  const accessToken = signAccessToken({ sub: userId, email, tier: 'shared' })

  return NextResponse.json({ accessToken, user: { id: userId, email, name, tier: 'shared' } }, { status: 201 })
}
