'use client'

import { useAuthStore } from '@/store/authStore'

export function QuotaBanner() {
  const user = useAuthStore((s) => s.user)
  if (!user) return null

  if (user.tier === 'byok') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <span className="font-medium">Unlimited</span>
        <span className="text-blue-600">— using your own key</span>
      </div>
    )
  }

  const pct = Math.min(100, Math.round((user.dailyCallCount / user.dailyLimit) * 100))
  const remaining = user.dailyRemaining

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-gray-700">
          <span className="font-medium">{user.dailyCallCount}</span>
          {' / '}
          <span>{user.dailyLimit}</span>
          {' calls used today'}
        </span>
        <span className={`text-xs font-medium ${remaining <= 10 ? 'text-red-600' : 'text-gray-500'}`}>
          {remaining} remaining
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
