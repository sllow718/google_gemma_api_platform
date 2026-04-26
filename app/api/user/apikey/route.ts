import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in Phase 7.' } }, { status: 501 })
}

export async function DELETE() {
  return NextResponse.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in Phase 7.' } }, { status: 501 })
}
