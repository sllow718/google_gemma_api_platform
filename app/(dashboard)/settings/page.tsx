'use client'

import { useState, type FormEvent } from 'react'
import { useAuthStore } from '@/store/authStore'
import { ApiKeyManager } from '@/components/ApiKeyManager'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const initialize = useAuthStore((s) => s.initialize)
  const { toast } = useToast()

  const [name, setName] = useState(user?.name ?? '')
  const [savingName, setSavingName] = useState(false)

  async function handleSaveName(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSavingName(true)
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) { toast('Failed to update name.', 'error'); return }
      toast('Display name updated.', 'success')
      await initialize()
    } catch {
      toast('Network error.', 'error')
    } finally {
      setSavingName(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-10">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Account section */}
      <section className="flex flex-col gap-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Account</h2>

        {/* Display name */}
        <form onSubmit={handleSaveName} className="flex items-end gap-3">
          <div className="flex-1">
            <Input
              id="display-name"
              label="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
            />
          </div>
          <Button type="submit" variant="secondary" loading={savingName}>Save</Button>
        </form>

        {/* Email (read-only) */}
        <Input id="email" label="Email" value={user?.email ?? ''} readOnly disabled />
      </section>

      {/* Google API Key section */}
      <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Google API Key</h2>
        <ApiKeyManager />
      </section>

      {/* Platform API Key section */}
      <PlatformApiKeySection />
    </div>
  )
}

function PlatformApiKeySection() {
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const initialize = useAuthStore((s) => s.initialize)
  const { toast } = useToast()
  const [generating, setGenerating] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const key = user?.platformApiKey ?? null

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/user/platformkey', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) { toast('Failed to generate key.', 'error'); return }
      toast('Platform API key generated.', 'success')
      setRevealed(true)
      await initialize()
    } catch { toast('Network error.', 'error') }
    finally { setGenerating(false) }
  }

  async function handleRevoke() {
    if (!confirm('Revoke your platform API key? Existing scripts using it will stop working.')) return
    setRevoking(true)
    try {
      await fetch('/api/user/platformkey', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      toast('Platform API key revoked.', 'success')
      setRevealed(false)
      await initialize()
    } catch { toast('Network error.', 'error') }
    finally { setRevoking(false) }
  }

  async function handleCopy() {
    if (!key) return
    await navigator.clipboard.writeText(key)
    toast('Copied to clipboard.', 'success')
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Platform API Key</h2>
        <p className="mt-1 text-sm text-gray-500">
          Use this key to call your saved API configurations from your own code via{' '}
          <code className="rounded bg-gray-100 px-1 text-xs">POST /api/v1/:configId/call</code>.
        </p>
      </div>

      {key ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-800 break-all">
              {revealed ? key : `${key.slice(0, 8)}${'•'.repeat(24)}`}
            </code>
            <button onClick={() => setRevealed((r) => !r)} className="shrink-0 text-xs text-blue-600 hover:underline">
              {revealed ? 'Hide' : 'Show'}
            </button>
            <button onClick={handleCopy} className="shrink-0 text-xs text-blue-600 hover:underline">Copy</button>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" size="sm" loading={generating} onClick={handleGenerate}>Regenerate</Button>
            <Button variant="danger" size="sm" loading={revoking} onClick={handleRevoke}>Revoke</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-500">No platform API key generated yet.</p>
          <Button size="sm" loading={generating} onClick={handleGenerate} className="self-start">
            Generate API key
          </Button>
        </div>
      )}
    </section>
  )
}
