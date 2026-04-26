import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in Phase 5.' } }, { status: 501 })
}

export async function PUT() {
  return NextResponse.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in Phase 5.' } }, { status: 501 })
}

export async function DELETE() {
  return NextResponse.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in Phase 5.' } }, { status: 501 })
}
