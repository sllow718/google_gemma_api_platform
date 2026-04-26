'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { CallPanel } from '@/components/CallPanel'
import { Quickstart } from '@/components/Quickstart'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/store/authStore'
import type { SavedApi, CallLog } from '@/lib/types'

export default function ApiCallPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const accessToken = useAuthStore((s) => s.accessToken)
  const [api, setApi] = useState<SavedApi | null>(null)
  const [recentCalls, setRecentCalls] = useState<CallLog[]>([])
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!accessToken) return
    const headers = { Authorization: `Bearer ${accessToken}` }

    fetch(`/api/apis/${id}`, { headers })
      .then((r) => r.json())
      .then((d: SavedApi) => setApi(d))
      .catch(() => router.push('/dashboard'))

    fetch(`/api/apis/${id}/calls?limit=5`, { headers })
      .then((r) => r.json())
      .then((d: { calls: CallLog[] }) => setRecentCalls(d.calls ?? []))
      .catch(() => {/* ignore */})
  }, [id, accessToken, router])

  async function handleDelete() {
    if (!confirm(`Delete "${api?.name}"? This cannot be undone.`)) return
    setDeleting(true)
    await fetch(`/api/apis/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
    router.push('/dashboard')
  }

  if (!api) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 grid gap-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-200" />)}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 flex flex-col gap-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-gray-800">Dashboard</Link>
        <span>/</span>
        <span className="text-gray-900">{api.name}</span>
      </div>

      {/* Config summary */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{api.name}</h1>
            {api.description && <p className="mt-1 text-sm text-gray-500">{api.description}</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href={`/dashboard/apis/${id}/edit`}>
              <Button variant="secondary" size="sm">Edit</Button>
            </Link>
            <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>Delete</Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-gray-100 pt-4 text-sm">
          {[
            { label: 'Model', value: api.model },
            { label: 'Temperature', value: api.temperature ?? 'default' },
            { label: 'Max tokens', value: api.maxOutputTokens ?? 'default' },
            { label: 'Total calls', value: api.callCount },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-gray-400">{label}</p>
              <p className="font-medium text-gray-800">{String(value)}</p>
            </div>
          ))}
        </div>
        {api.systemPrompt && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400 mb-1">System prompt</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{api.systemPrompt}</p>
          </div>
        )}
      </div>

      {/* Call panel */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-6 text-lg font-semibold text-gray-900">Call API</h2>
        <CallPanel apiId={id} recentCalls={recentCalls} />
      </div>

      {recentCalls.length > 0 && (
        <div className="text-center">
          <Link href={`/dashboard/apis/${id}/history`} className="text-sm text-blue-600 hover:underline">
            View full call history →
          </Link>
        </div>
      )}

      <Quickstart configId={id} />
    </div>
  )
}
