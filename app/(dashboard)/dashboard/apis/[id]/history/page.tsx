'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { CallHistoryTable } from '@/components/CallHistoryTable'
import { SkeletonTable } from '@/components/ui/Skeleton'
import type { CallLog } from '@/lib/types'

const LIMIT = 20

export default function CallHistoryPage() {
  const { id } = useParams<{ id: string }>()
  const accessToken = useAuthStore((s) => s.accessToken)
  const [calls, setCalls] = useState<CallLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [apiName, setApiName] = useState<string>('')

  useEffect(() => {
    if (!accessToken) return
    fetch(`/api/apis/${id}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((d: { name?: string }) => setApiName(d.name ?? ''))
      .catch(() => {/* ignore */})
  }, [id, accessToken])

  useEffect(() => {
    if (!accessToken) return
    setLoading(true)
    fetch(`/api/apis/${id}/calls?page=${page}&limit=${LIMIT}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((d: { calls: CallLog[]; total: number }) => {
        setCalls(d.calls ?? [])
        setTotal(d.total ?? 0)
      })
      .catch(() => {/* ignore */})
      .finally(() => setLoading(false))
  }, [id, accessToken, page])

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
