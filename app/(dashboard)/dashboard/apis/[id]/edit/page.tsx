'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ApiConfigForm } from '@/components/ApiConfigForm'
import { useAuthStore } from '@/store/authStore'
import type { SavedApi } from '@/lib/types'

type FormData = Omit<SavedApi, 'id' | 'userId' | 'callCount' | 'createdAt' | 'updatedAt'>

export default function EditApiPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const accessToken = useAuthStore((s) => s.accessToken)
  const [api, setApi] = useState<SavedApi | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!accessToken) return
    fetch(`/api/apis/${id}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((d: SavedApi) => setApi(d))
      .catch(() => router.push('/dashboard'))
  }, [id, accessToken, router])

  async function handleSubmit(data: FormData) {
    setLoading(true)
    try {
      const res = await fetch(`/api/apis/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(data),
      })
      const body = await res.json() as { error?: { message?: string } }
      if (!res.ok) throw new Error(body.error?.message ?? 'Failed to update API configuration.')
      router.push(`/dashboard/apis/${id}`)
    } finally {
      setLoading(false)
    }
  }

  if (!api) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-gray-800">Dashboard</Link>
        <span>/</span>
        <Link href={`/dashboard/apis/${id}`} className="hover:text-gray-800">{api.name}</Link>
        <span>/</span>
        <span className="text-gray-900">Edit</span>
      </div>
      <h1 className="mb-8 text-2xl font-bold text-gray-900">Edit API Configuration</h1>
      <ApiConfigForm initial={api} onSubmit={handleSubmit} loading={loading} submitLabel="Save changes" />
    </div>
  )
}
