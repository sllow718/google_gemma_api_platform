'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ApiConfigForm } from '@/components/ApiConfigForm'
import { useAuthStore } from '@/store/authStore'
import type { SavedApi } from '@/lib/types'

type FormData = Omit<SavedApi, 'id' | 'userId' | 'callCount' | 'createdAt' | 'updatedAt'>

export default function NewApiPage() {
  const router = useRouter()
  const accessToken = useAuthStore((s) => s.accessToken)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(data: FormData) {
    setLoading(true)
    try {
      const res = await fetch('/api/apis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(data),
      })
      const body = await res.json() as { id: string; error?: { message?: string } }
      if (!res.ok) throw new Error(body.error?.message ?? 'Failed to create API configuration.')
      router.push(`/dashboard/apis/${body.id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-gray-800">Dashboard</Link>
        <span>/</span>
        <span className="text-gray-900">New API</span>
      </div>
      <h1 className="mb-8 text-2xl font-bold text-gray-900">Create API Configuration</h1>
      <ApiConfigForm onSubmit={handleSubmit} loading={loading} submitLabel="Create" />
    </div>
  )
}
