'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/store/authStore'
import { passwordStrength } from '@/lib/passwordStrength'
import { SignupSchema } from '@/lib/validate'
import type { UserProfile } from '@/store/authStore'

const strengthLabel = { weak: 'Weak', medium: 'Medium', strong: 'Strong' }
const strengthColor = { weak: 'bg-red-400', medium: 'bg-yellow-400', strong: 'bg-green-500' }
const strengthWidth = { weak: 'w-1/3', medium: 'w-2/3', strong: 'w-full' }

export default function SignupPage() {
  const router = useRouter()
  const login = useAuthStore((s) => s.login)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const strength = password ? passwordStrength(password) : null

  function validate(): boolean {
    const errors: Record<string, string> = {}
    const result = SignupSchema.safeParse({ name, email, password })
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = String(issue.path[0] ?? 'form')
        if (!errors[field]) errors[field] = issue.message
      }
    }
    if (password && confirm && password !== confirm) {
      errors.confirm = 'Passwords do not match.'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    if (!validate()) return

    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const data = await res.json() as { accessToken?: string; error?: { code: string; message?: string } }

      if (!res.ok) {
        setServerError(
          data.error?.code === 'CONFLICT'
            ? 'An account with that email already exists.'
            : (data.error?.message ?? 'Something went wrong. Please try again.')
        )
        return
      }

      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${data.accessToken!}` },
      })
      const profile = await meRes.json() as UserProfile
      login(data.accessToken!, profile)
      router.push('/dashboard')
    } catch {
      setServerError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Create an account</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <Input
            id="name"
            label="Name"
            placeholder="Jane Smith"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={fieldErrors.name}
            required
          />
          <Input
            id="email"
            type="email"
            label="Email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            required
          />

          <div className="flex flex-col gap-1">
            <Input
              id="password"
              type="password"
              label="Password"
              placeholder="••••••••"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              required
            />
            {strength && (
              <div className="mt-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                  <div className={`h-full rounded-full transition-all ${strengthColor[strength]} ${strengthWidth[strength]}`} />
                </div>
                <p className={`mt-1 text-xs font-medium ${strength === 'strong' ? 'text-green-600' : strength === 'medium' ? 'text-yellow-600' : 'text-red-500'}`}>
                  {strengthLabel[strength]}
                </p>
              </div>
            )}
          </div>

          <Input
            id="confirm"
            type="password"
            label="Confirm password"
            placeholder="••••••••"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={fieldErrors.confirm}
            required
          />

          {serverError && (
            <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {serverError}
            </p>
          )}

          <Button type="submit" loading={loading} className="mt-2 w-full">
            {loading ? 'Creating account…' : 'Sign up'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-blue-600 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
