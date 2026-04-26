import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'refreshToken'
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 // seconds

export interface AccessTokenPayload {
  sub: string
  email: string
  tier: string
  iat: number
  exp: number
}

export function signAccessToken(payload: { sub: string; email: string; tier: string }): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn: '15m' })
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, process.env.JWT_SECRET!) as AccessTokenPayload
}

export function generateRefreshToken(): string {
  return uuidv4()
}

// Cookie value format: "{userId}:{token}" — userId is a UUID (no colons), safe to split on first colon
export async function setRefreshCookie(userId: string, token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, `${userId}:${token}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_MAX_AGE,
    path: '/',
  })
}

export async function getRefreshCookie(): Promise<{ userId: string; token: string } | null> {
  const cookieStore = await cookies()
  const value = cookieStore.get(COOKIE_NAME)?.value
  if (!value) return null
  const colonIndex = value.indexOf(':')
  if (colonIndex === -1) return null
  return { userId: value.slice(0, colonIndex), token: value.slice(colonIndex + 1) }
}

export async function clearRefreshCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
}

export function getAuthPayload(request: Request): AccessTokenPayload | null {
  try {
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return verifyAccessToken(auth.slice(7))
  } catch {
    return null
  }
}
