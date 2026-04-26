'use client'

import { useState, type FormEvent } from 'react'
import { useAuthStore } from '@/store/authStore'
import { ApiKeyManager } from '@/components/ApiKeyManager'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { passwordStrength } from '@/lib/passwordStrength'

const strengthColor = { weak: 'bg-red-400', medium: 'bg-yellow-400', strong: 'bg-green-500' }
const strengthWidth = { weak: 'w-1/3', medium: 'w-2/3', strong: 'w-full' }

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const initialize = useAuthStore((s) => s.initialize)
  const { toast } = useToast()

  // Display name
  const [name, setName] = useState(user?.name ?? '')
  const [savingName, setSavingName] = useState(false)

  // Password
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [savingPw, setSavingPw] = useState(false)

  const strength = newPw ? passwordStrength(newPw) : null

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

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setPwError(null)
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return }
    if (!strength || strength === 'weak') { setPwError('New password is too weak.'); return }
    setSavingPw(true)
    try {
      const res = await fetch('/api/user/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      })
      const data = await res.json() as { error?: { code: string; message?: string } }
      if (!res.ok) {
        setPwError(data.error?.code === 'WRONG_PASSWORD'
          ? 'Current password is incorrect.'
          : (data.error?.message ?? 'Failed to change password.'))
        return
      }
      toast('Password changed.', 'success')
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch {
      toast('Network error.', 'error')
    } finally {
      setSavingPw(false)
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

        {/* Change password */}
        <div className="border-t border-gray-100 pt-4">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">Change password</h3>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
            <Input
              id="current-password"
              type="password"
              label="Current password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              autoComplete="current-password"
              required
            />
            <div className="flex flex-col gap-1">
              <Input
                id="new-password"
                type="password"
                label="New password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
                required
              />
              {strength && (
                <div className="mt-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                    <div className={`h-full rounded-full transition-all ${strengthColor[strength]} ${strengthWidth[strength]}`} />
                  </div>
                </div>
              )}
            </div>
            <Input
              id="confirm-password"
              type="password"
              label="Confirm new password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              autoComplete="new-password"
              required
            />
            {pwError && <p role="alert" className="text-sm text-red-600">{pwError}</p>}
            <Button type="submit" variant="secondary" loading={savingPw} className="self-start">
              Change password
            </Button>
          </form>
        </div>
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
