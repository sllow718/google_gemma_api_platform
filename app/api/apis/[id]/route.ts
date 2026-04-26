import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { UpdateApiSchema } from '@/lib/validate'
import { getSavedApiById, updateSavedApi, deleteSavedApi, deleteCallLogsByApi } from '@/lib/sheets'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  const payload = getAuthPayload(request)
  if (!payload) return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })

  const { id } = await params
  const api = await getSavedApiById(id)
  if (!api) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
  if (api.userId !== payload.sub) return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 })

  return NextResponse.json(api)
}

export async function PUT(request: Request, { params }: Ctx): Promise<Response> {
  const payload = getAuthPayload(request)
  if (!payload) return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })

  const { id } = await params
  const api = await getSavedApiById(id)
  if (!api) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
  if (api.userId !== payload.sub) return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON' } }, { status: 400 })
  }

  const parsed = UpdateApiSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() } }, { status: 400 })
  }

  const now = new Date().toISOString()
  await updateSavedApi(id, { ...parsed.data, updatedAt: now })
  return NextResponse.json({ ...api, ...parsed.data, updatedAt: now })
}

export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  const payload = getAuthPayload(request)
  if (!payload) return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })

  const { id } = await params
  const api = await getSavedApiById(id)
  if (!api) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
  if (api.userId !== payload.sub) return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 })

  await Promise.all([deleteSavedApi(id), deleteCallLogsByApi(id)])
  return new NextResponse(null, { status: 204 })
}
