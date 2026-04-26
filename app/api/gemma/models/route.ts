import { NextResponse } from 'next/server'
import { listGemmaModels } from '@/lib/googleAI'

export async function GET(): Promise<Response> {
  const models = await listGemmaModels(process.env.GOOGLE_API_KEY!)
  return NextResponse.json({ models })
}
