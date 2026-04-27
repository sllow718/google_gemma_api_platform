import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { v4 as uuidv4 } from 'uuid'
import { signAccessToken, generateRefreshToken } from '@/lib/auth'
import {
  createUser,
  getUserByEmail,
  getUserByGoogleId,
  getUserById,
  setRefreshToken,
  updateGoogleId,
  updateLastLogin,
} from '@/lib/sheets'

const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

interface GoogleTokenResponse {
  access_token: string
  id_token: string
}

interface GoogleIdTokenPayload {
  sub: string
  email: string
  name: string
}

function decodeIdToken(idToken: string): GoogleIdTokenPayload {
  const payload = idToken.split('.')[1]
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as GoogleIdTokenPayload
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  const cookieStore = await cookies()
  const savedState = cookieStore.get('oauth_state')?.value
  cookieStore.delete('oauth_state')

  if (errorParam || !code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${APP_URL}/login?error=auth_failed`)
  }

  // Exchange authorization code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${APP_URL}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${APP_URL}/login?error=auth_failed`)
  }

  const tokens = (await tokenRes.json()) as GoogleTokenResponse
  const profile = decodeIdToken(tokens.id_token)

  // Find or create user
  let user = await getUserByGoogleId(profile.sub)

  if (!user) {
    // Check if an account already exists with this email (e.g. legacy password account)
    const existing = await getUserByEmail(profile.email)
    if (existing) {
      await updateGoogleId(existing.id, profile.sub)
      user = await getUserById(existing.id)
    } else {
      const id = uuidv4()
      await createUser({
        id,
        email: profile.email,
        name: profile.name,
        createdAt: new Date().toISOString(),
        googleId: profile.sub,
      })
      user = await getUserById(id)
    }
  }

  if (!user) {
    return NextResponse.redirect(`${APP_URL}/login?error=auth_failed`)
  }

  const refreshToken = generateRefreshToken()
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS).toISOString()
  await setRefreshToken(user.id, refreshToken, expiresAt)
  await updateLastLogin(user.id, new Date().toISOString())

  // Set the cookie directly on the redirect response — cookies() from next/headers
  // does not carry over to a manually constructed NextResponse.
  const response = NextResponse.redirect(`${APP_URL}/dashboard`)
  response.cookies.set('refreshToken', `${user.id}:${refreshToken}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: REFRESH_MAX_AGE,
    path: '/',
  })
  return response
}
