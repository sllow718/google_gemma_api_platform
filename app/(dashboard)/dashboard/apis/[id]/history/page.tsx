'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { CallHistoryTable } from '@/components/CallHistoryTable'
import { SkeletonTable } from '@/components/ui/Skeleton'
import type { CallLog } from '@/lib/types'

const LIMIT = 20

export default function CallHistoryPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const accessToken = useAuthStore((s) => s.accessToken)
  const [calls, setCalls] = useState<CallLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [apiName, setApiName] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken || typeof id !== 'string') return

    fetch(`/api/apis/${id}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (r) => {
        if (r.status === 404) {
          router.push('/dashboard')
          return null
        }
        return (await r.json()) as { name?: string }
      })
      .then((d) => {
        if (d) setApiName(d.name ?? '')
      })
      .catch(() => {
        setError('We could not load this API configuration.')
      })
  }, [id, accessToken, router])

  useEffect(() => {
    if (!accessToken || typeof id !== 'string') return
    let cancelled = false

    async function loadCalls() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/apis/${id}/calls?page=${page}&limit=${LIMIT}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (response.status === 404) {
          router.push('/dashboard')
          return
        }
        const d = (await response.json()) as { calls: CallLog[]; total: number }

        if (cancelled) return

        setCalls(d.calls ?? [])
        setTotal(d.total ?? 0)
      } catch {
        if (!cancelled) setError('We could not load call history for this API.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadCalls()

    return () => {
      cancelled = true
    }
  }, [id, accessToken, page, router])

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-gray-800">Dashboard</Link>
        <span>/</span>
        <Link href={`/dashboard/apis/${id}`} className="hover:text-gray-800">{apiName || id}</Link>
        <span>/</span>
        <span className="text-gray-900">History</span>
      </div>

      <h1 className="text-xl font-semibold text-gray-900">Call History</h1>

      {loading ? (
        <SkeletonTable rows={LIMIT} />
      ) : (
        <CallHistoryTable
          calls={calls}
          total={total}
          page={page}
          limit={LIMIT}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}
