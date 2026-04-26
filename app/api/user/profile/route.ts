import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthPayload } from '@/lib/auth'
import { updateUserName } from '@/lib/sheets'

const ProfileSchema = z.object({ name: z.string().min(1).max(100) })

export async function PATCH(request: Request): Promise<Response> {
  const payload = getAuthPayload(request)
  if (!payload) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON' } }, { status: 400 })
  }

  const parsed = ProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() } }, { status: 400 })
  }

  const { name } = parsed.data
  await updateUserName(payload.sub, name)
  return NextResponse.json({ name })
}
