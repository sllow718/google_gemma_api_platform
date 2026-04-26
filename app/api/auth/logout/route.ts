import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in Phase 4.' } }, { status: 501 })
}
