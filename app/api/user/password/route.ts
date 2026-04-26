import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { getAuthPayload } from '@/lib/auth'
import { getUserById, updatePassword } from '@/lib/sheets'

const PasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[0-9]/, 'Must contain digit')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
})

export async function POST(request: Request): Promise<Response> {
  const payload = getAuthPayload(request)
  if (!payload) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON' } }, { status: 400 })
  }

  const parsed = PasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() } }, { status: 400 })
  }

  const { currentPassword, newPassword } = parsed.data

  const user = await getUserById(payload.sub)
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: { code: 'WRONG_PASSWORD', message: 'Current password is incorrect' } }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await updatePassword(payload.sub, passwordHash)
  return NextResponse.json({ success: true })
}
