'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/Toast'

export function ApiKeyManager() {
  const user = useAuthStore((s) => s.user)
  const initialize = useAuthStore((s) => s.initialize)
  const { toast } = useToast()

  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const accessToken = useAuthStore((s) => s.accessToken)

  async function handleSave() {
    if (!keyInput.trim()) return
    setSaveError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/user/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ apiKey: keyInput.trim() }),
      })
      const data = await res.json() as { keyHint?: string; error?: { message?: string } }
      if (!res.ok) {
        setSaveError(data.error?.message ?? 'Key validation failed. Please check the key and try again.')
        return
      }
      setKeyInput('')
      toast(`API key saved (ending in ${data.keyHint})`, 'success')
      await initialize()
    } catch {
      setSaveError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!confirm('Remove your API key? You will revert to the shared tier (50 calls/day).')) return
    setRemoving(true)
    try {
      await fetch('/api/user/apikey', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      toast('API key removed. Reverted to shared tier.', 'success')
      await initialize()
    } catch {
      toast('Failed to remove key. Please try again.', 'error')
    } finally {
      setRemoving(false)
    }
  }

  const isByok = user?.tier === 'byok'

  return (
    <div className="flex flex-col gap-6">
      {/* Status */}
      <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${isByok ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
        <div className={`h-2.5 w-2.5 rounded-full ${isByok ? 'bg-blue-500' : 'bg-gray-400'}`} />
        <p className="text-sm text-gray-700">
          {isByok
            ? <>Using your own key (ending in <code className="font-mono font-semibold">{user.keyHint}</code>)</>
            : 'Using shared key (50 calls/day)'}
        </p>
      </div>

      {/* Add / Replace */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">
          {isByok ? 'Replace key' : 'Add your own Google API key'}
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => { setKeyInput(e.target.value); setSaveError(null) }}
            placeholder="AIzaSy…"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button onClick={handleSave} loading={saving} disabled={!keyInput.trim()}>
            Save Key
          </Button>
        </div>
        {saveError && <p className="text-sm text-red-600">{saveError}</p>}
      </div>

      {/* Remove */}
      {isByok && (
        <Button variant="danger" size="sm" onClick={handleRemove} loading={removing} className="self-start">
          Remove key
        </Button>
      )}

      {/* Info callout */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-4 text-sm text-blue-800">
        <p className="mb-1 font-medium">About API key tiers</p>
        <p className="text-blue-700">
          The shared key gives 50 calls/day. Add your own Google API key for unlimited access — calls then count against your Google Cloud quota only.{' '}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-blue-900"
          >
            Get a key from Google Cloud Console →
          </a>
        </p>
      </div>
    </div>
  )
}
