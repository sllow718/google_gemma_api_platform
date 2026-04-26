'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/store/authStore'
import { truncate } from '@/lib/formatUtils'
import type { CallLog } from '@/lib/types'

interface CallResponse {
  text: string
  model: string
  finishReason: string
  usage: { promptTokenCount: number; responseTokenCount: number; totalTokenCount: number }
  latencyMs: number
  callLogId: string
}

interface CallPanelProps {
  apiId: string
  recentCalls: CallLog[]
}

export function CallPanel({ apiId, recentCalls }: CallPanelProps) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  const [prompt, setPrompt] = useState('')
  const [temperature, setTemperature] = useState<string>('')
  const [maxTokens, setMaxTokens] = useState<string>('')
  const [showOverrides, setShowOverrides] = useState(false)
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<CallResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const remaining = user?.tier === 'shared' ? (user.dailyRemaining ?? 0) : Infinity
  const nearLimit = user?.tier === 'shared' && remaining <= 10

  async function handleCall() {
    if (!prompt.trim()) return
    setError(null)
    setResponse(null)
    setLoading(true)

    try {
      const overrides: Record<string, number> = {}
      if (temperature) overrides.temperature = parseFloat(temperature)
      if (maxTokens) overrides.maxOutputTokens = parseInt(maxTokens)

      const res = await fetch(`/api/apis/${apiId}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ prompt, ...(Object.keys(overrides).length ? { overrides } : {}) }),
      })
      const data = await res.json() as CallResponse & { error?: { code: string; message?: string } }

      if (!res.ok) {
        const msg = (data as { error?: { code: string; message?: string } }).error
        setError(msg?.code === 'QUOTA_EXCEEDED'
          ? 'Daily call quota exhausted. Add your own API key in Settings for unlimited access.'
          : (msg?.message ?? 'Call failed. Please try again.'))
        return
      }
      setResponse(data)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function copyResponse() {
    if (!response) return
    await navigator.clipboard.writeText(response.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-6">
      {nearLimit && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          ⚠ Only {remaining} call{remaining === 1 ? '' : 's'} remaining today.{' '}
          <a href="/settings" className="font-medium underline">Add your own key</a> for unlimited access.
        </div>
      )}

      {/* Prompt */}
      <div className="flex flex-col gap-2">
        <label htmlFor="prompt" className="text-sm font-medium text-gray-700">Prompt</label>
        <textarea
          id="prompt"
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your prompt…"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          maxLength={32000}
        />
        <p className="text-right text-xs text-gray-400">{prompt.length} / 32000</p>
      </div>

      {/* Overrides */}
      <div>
        <button
          type="button"
          onClick={() => setShowOverrides((o) => !o)}
          className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
        >
          {showOverrides ? '▾' : '▸'} Override parameters
        </button>
        {showOverrides && (
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Temperature</label>
              <input
                type="number" min={0} max={2} step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                placeholder="saved value"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Max Output Tokens</label>
              <input
                type="number" min={1} max={8192}
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                placeholder="saved value"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      <Button onClick={handleCall} loading={loading} disabled={!prompt.trim()} className="self-start px-8">
        {loading ? 'Calling…' : 'Call API'}
      </Button>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {response && (
        <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Response</h3>
            <button
              onClick={copyResponse}
              className="text-xs text-blue-600 hover:underline"
            >
              {copied ? 'Copied!' : 'Copy response'}
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-gray-900 font-sans">{response.text}</pre>
          <div className="flex flex-wrap gap-4 border-t border-gray-200 pt-3 text-xs text-gray-500">
            <span>Prompt tokens: <strong>{response.usage.promptTokenCount}</strong></span>
            <span>Response tokens: <strong>{response.usage.responseTokenCount}</strong></span>
            <span>Total tokens: <strong>{response.usage.totalTokenCount}</strong></span>
            <span>Latency: <strong>{response.latencyMs}ms</strong></span>
            <span>Finish: <strong>{response.finishReason}</strong></span>
          </div>
        </div>
      )}

      {/* Recent calls */}
      {recentCalls.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-gray-700">Recent calls</h3>
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {recentCalls.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 px-4 py-3 text-xs text-gray-600">
                <span className="truncate max-w-xs">{truncate(c.prompt, 80)}</span>
                <span className="shrink-0 text-gray-400">{c.totalTokenCount} tok</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
