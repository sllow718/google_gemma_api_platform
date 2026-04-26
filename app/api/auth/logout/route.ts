import { NextResponse } from 'next/server'
import { getRefreshCookie, clearRefreshCookie } from '@/lib/auth'
import { clearRefreshToken } from '@/lib/sheets'

export async function POST(): Promise<Response> {
  const cookie = await getRefreshCookie()
  if (cookie) {
    await clearRefreshToken(cookie.userId).catch(() => undefined)
  }
  await clearRefreshCookie()
  return NextResponse.json({ ok: true })
}
