import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getAuthPayload } from '@/lib/auth'
import { setPlatformApiKey, clearPlatformApiKey } from '@/lib/sheets'

function generatePlatformKey(): string {
  return 'gmp_' + uuidv4().replace(/-/g, '')
}

export async function POST(request: Request): Promise<Response> {
  const payload = getAuthPayload(request)
  if (!payload) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const platformApiKey = generatePlatformKey()
  await setPlatformApiKey(payload.sub, platformApiKey)
  return NextResponse.json({ platformApiKey })
}

export async function DELETE(request: Request): Promise<Response> {
  const payload = getAuthPayload(request)
  if (!payload) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  await clearPlatformApiKey(payload.sub)
  return NextResponse.json({ success: true })
}
