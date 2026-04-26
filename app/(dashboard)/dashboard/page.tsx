'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { QuotaBanner } from '@/components/QuotaBanner'
import { ApiCard } from '@/components/ApiCard'
import { Button } from '@/components/ui/Button'
import type { SavedApi } from '@/lib/types'

export default function DashboardPage() {
  const { accessToken } = useAuthStore()
  const [apis, setApis] = useState<SavedApi[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!accessToken) return
    fetch('/api/apis', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((d: { apis: SavedApi[] }) => setApis(d.apis ?? []))
      .catch(() => {/* ignore */})
      .finally(() => setLoading(false))
  }, [accessToken])

  const atLimit = apis.length >= 20

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 flex flex-col gap-6">
      <QuotaBanner />

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Your API Configurations</h1>
        <div className="relative">
          <Link href="/dashboard/apis/new">
            <Button disabled={atLimit}>New API</Button>
          </Link>
          {atLimit && (
            <p className="absolute right-0 top-full mt-1 w-48 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg">
              You&apos;ve reached the 20-configuration limit.
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl border border-gray-200 bg-white animate-pulse" />
          ))}
        </div>
      ) : apis.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <p className="text-gray-500">No API configurations yet.</p>
          <Link href="/dashboard/apis/new">
            <Button>Create your first API</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apis.map((api) => <ApiCard key={api.id} api={api} />)}
        </div>
      )}
    </div>
  )
}
