import Link from 'next/link'
import type { SavedApi } from '@/lib/types'
import { formatDate } from '@/lib/formatUtils'

interface ApiCardProps {
  api: SavedApi
}

export function ApiCard({ api }: ApiCardProps) {
  return (
    <Link
      href={`/dashboard/apis/${api.id}`}
      className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-gray-900 leading-snug">{api.name}</h3>
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
          {api.model}
        </span>
      </div>
      {api.description && (
        <p className="text-sm text-gray-500 line-clamp-2">{api.description}</p>
      )}
      <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-100">
        <span>{api.callCount} {api.callCount === 1 ? 'call' : 'calls'}</span>
        <span>Updated {formatDate(api.updatedAt)}</span>
      </div>
    </Link>
  )
}
