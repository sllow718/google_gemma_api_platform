'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/store/authStore'
import type { SavedApi, SafetySetting } from '@/lib/types'
import type { GemmaModel } from '@/lib/googleAI'

type FormData = Omit<SavedApi, 'id' | 'userId' | 'callCount' | 'createdAt' | 'updatedAt'>

interface ApiConfigFormProps {
  initial?: Partial<FormData>
  onSubmit: (data: FormData) => Promise<void>
  loading?: boolean
  submitLabel?: string
}

const HARM_CATEGORIES = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
]
const HARM_THRESHOLDS = ['BLOCK_NONE', 'BLOCK_ONLY_HIGH', 'BLOCK_MEDIUM_AND_ABOVE', 'BLOCK_LOW_AND_ABOVE']

const DEFAULTS: FormData = {
  name: '',
  description: null,
  model: '',
  temperature: null,
  topP: null,
  topK: null,
  maxOutputTokens: null,
  stopSequences: [],
  safetySettings: [],
  systemPrompt: null,
}

export function ApiConfigForm({ initial, onSubmit, loading = false, submitLabel = 'Save' }: ApiConfigFormProps) {
  const tier = useAuthStore((s) => s.user?.tier ?? 'shared')
  const [models, setModels] = useState<GemmaModel[]>([])
  const [form, setForm] = useState<FormData>({ ...DEFAULTS, ...initial })
  const [stopInput, setStopInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/gemma/models')
      .then((r) => r.json())
      .then((d: { models: GemmaModel[] }) => {
        setModels(d.models)
        if (!form.model && d.models.length > 0) {
          setForm((f) => ({ ...f, model: d.models[0].id }))
        }
      })
      .catch(() => {/* ignore */})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const maxTokensCap = tier === 'shared' ? 4096 : 8192

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function addStop() {
    const val = stopInput.trim()
    if (!val || form.stopSequences.includes(val)) return
    set('stopSequences', [...form.stopSequences, val])
    setStopInput('')
  }

  function removeStop(s: string) {
    set('stopSequences', form.stopSequences.filter((x) => x !== s))
  }

  function getSafety(cat: string): string {
    return form.safetySettings.find((s) => s.category === cat)?.threshold ?? ''
  }

  function setSafety(cat: string, threshold: string) {
    const updated = form.safetySettings.filter((s) => s.category !== cat)
    if (threshold) updated.push({ category: cat, threshold })
    set('safetySettings', updated)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) { setError('Name is required.'); return }
    if (!form.model) { setError('Model is required.'); return }
    try {
      await onSubmit(form)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Name */}
      <Input id="name" label="Name *" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={100} required />

      {/* Description */}
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium text-gray-700">Description</label>
        <textarea
          id="description"
          rows={2}
          value={form.description ?? ''}
          onChange={(e) => set('description', e.target.value || null)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Model */}
      <div className="flex flex-col gap-1">
        <label htmlFor="model" className="text-sm font-medium text-gray-700">Model *</label>
        <select
          id="model"
          value={form.model}
          onChange={(e) => set('model', e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {models.length === 0 && <option value="">Loading models…</option>}
          {models.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
        </select>
      </div>

      {/* System Prompt */}
      <div className="flex flex-col gap-1">
        <label htmlFor="system-prompt" className="flex items-center gap-1 text-sm font-medium text-gray-700">
          System Prompt
          <span title="Instructs the model how to behave before the user's prompt." className="cursor-help text-gray-400">ⓘ</span>
        </label>
        <textarea
          id="system-prompt"
          rows={3}
          value={form.systemPrompt ?? ''}
          onChange={(e) => set('systemPrompt', e.target.value || null)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Temperature */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Temperature</label>
        <div className="flex items-center gap-3">
          <input
            type="range" min={0} max={2} step={0.05}
            value={form.temperature ?? 1}
            onChange={(e) => set('temperature', parseFloat(e.target.value))}
            className="flex-1"
          />
          <input
            type="number" min={0} max={2} step={0.05}
            value={form.temperature ?? ''}
            onChange={(e) => set('temperature', e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="default"
            className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Top P */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Top P</label>
        <div className="flex items-center gap-3">
          <input
            type="range" min={0} max={1} step={0.01}
            value={form.topP ?? 0.95}
            onChange={(e) => set('topP', parseFloat(e.target.value))}
            className="flex-1"
          />
          <input
            type="number" min={0} max={1} step={0.01}
            value={form.topP ?? ''}
            onChange={(e) => set('topP', e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="default"
            className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Top K */}
      <Input
        id="top-k" label="Top K" type="number" min={1}
        value={form.topK ?? ''}
        onChange={(e) => set('topK', e.target.value ? parseInt(e.target.value) : null)}
        placeholder="default"
      />

      {/* Max Output Tokens */}
      <Input
        id="max-tokens"
        label={`Max Output Tokens${tier === 'shared' ? ` (max ${maxTokensCap})` : ''}`}
        type="number" min={1} max={maxTokensCap}
        value={form.maxOutputTokens ?? ''}
        onChange={(e) => set('maxOutputTokens', e.target.value ? Math.min(parseInt(e.target.value), maxTokensCap) : null)}
        placeholder="default"
      />

      {/* Stop Sequences */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">Stop Sequences</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={stopInput}
            onChange={(e) => setStopInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStop() } }}
            placeholder="Add sequence and press Enter"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button type="button" variant="secondary" size="sm" onClick={addStop}>Add</Button>
        </div>
        {form.stopSequences.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {form.stopSequences.map((s) => (
              <span key={s} className="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                <code>{s}</code>
                <button type="button" onClick={() => removeStop(s)} className="text-gray-400 hover:text-gray-700">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Safety Settings */}
      <div className="flex flex-col gap-3">
        <label className="text-sm font-medium text-gray-700">Safety Settings</label>
        {HARM_CATEGORIES.map((cat) => (
          <div key={cat} className="flex items-center justify-between gap-4">
            <span className="text-xs text-gray-600">{cat.replace('HARM_CATEGORY_', '').replace(/_/g, ' ')}</span>
            <select
              value={getSafety(cat)}
              onChange={(e) => setSafety(cat, e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Model default</option>
              {HARM_THRESHOLDS.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <Button type="submit" loading={loading} className="self-start px-8">
        {submitLabel}
      </Button>
    </form>
  )
}
