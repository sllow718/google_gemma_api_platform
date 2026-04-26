'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'

interface QuickstartProps {
  configId: string
}

export function Quickstart({ configId }: QuickstartProps) {
  const user = useAuthStore((s) => s.user)
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const endpoint = `${baseUrl}/api/v1/${configId}/call`
  const apiKey = user?.platformApiKey ?? 'YOUR_PLATFORM_API_KEY'
  const hasKey = !!user?.platformApiKey

  const snippet = `const response = await fetch('${endpoint}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': '${apiKey}'
  },
  body: JSON.stringify({
    prompt: 'Your prompt here',
    // Optional overrides:
    // overrides: { temperature: 0.7, maxOutputTokens: 1024 }
  })
});

const data = await response.json();
console.log(data.text);
// Response shape:
// {
//   text: string,
//   model: string,
//   finishReason: string,
//   usage: { promptTokenCount, responseTokenCount, totalTokenCount },
//   latencyMs: number,
//   callLogId: string
// }`

  async function handleCopy() {
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <span className="font-semibold text-gray-900">Quickstart — Node.js</span>
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
              POST {endpoint}
            </code>
          </div>

          <div className="relative">
            <p className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">Node.js snippet</p>
            <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100 leading-relaxed">
              <code>{snippet}</code>
            </pre>
            <button
              onClick={handleCopy}
              className="absolute right-3 top-8 rounded bg-gray-700 px-2 py-1 text-xs text-gray-200 hover:bg-gray-600"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          <p className="text-xs text-gray-400">
            Calls through this endpoint use your saved configuration and count against your quota.
          </p>
        </div>
      )}
    </div>
  )
}
