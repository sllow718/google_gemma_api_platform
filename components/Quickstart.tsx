'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { buildPostmanCollection } from '@/lib/postman'

interface QuickstartProps {
  configId: string
}

export function Quickstart({ configId }: QuickstartProps) {
  const user = useAuthStore((s) => s.user)
  const [open, setOpen] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const apiKey = user?.platformApiKey ?? 'YOUR_PLATFORM_API_KEY'
  const hasKey = !!user?.platformApiKey

  async function handleDownload() {
    const collection = buildPostmanCollection(configId, baseUrl, apiKey)
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `gemma-api-platform-${configId}.postman_collection.json`
    link.click()
    URL.revokeObjectURL(url)
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 2000)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <span className="font-semibold text-gray-900">Quickstart — Postman</span>
        <span className="text-gray-400">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-6 pb-6 flex flex-col gap-4">
          {!hasKey && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              You need a Platform API Key to call this endpoint from your code.{' '}
              <Link href="/settings" className="font-medium underline">
                Generate one in Settings →
              </Link>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Endpoint</p>
            <code className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800 break-all">
              POST {baseUrl}/api/v1/{configId}/call
            </code>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Postman collection
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleDownload}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
              >
                {downloaded ? 'Downloaded' : 'Download .json'}
              </button>
              <span className="text-xs text-gray-500">
                Import the downloaded file directly into Postman.
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            The collection includes the endpoint, headers, and a sample body with Postman variables.
          </p>
        </div>
      )}
    </div>
  )
}
