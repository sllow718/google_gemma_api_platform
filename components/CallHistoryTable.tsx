'use client'

import { useState } from 'react'
import type { CallLog } from '@/lib/types'
import { formatDate, truncate } from '@/lib/formatUtils'

interface CallHistoryTableProps {
  calls: CallLog[]
  total: number
  page: number
  limit: number
  onPageChange: (page: number) => void
}

export function CallHistoryTable({ calls, total, page, limit, onPageChange }: CallHistoryTableProps) {
  const [selected, setSelected] = useState<CallLog | null>(null)
  const totalPages = Math.ceil(total / limit)

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              {['Time', 'Prompt', 'Response', 'Tokens', 'Latency', 'Tier', 'Finish'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {calls.map((c) => (
              <tr
                key={c.id}
                onClick={() => setSelected(c)}
                className="cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <td className="whitespace-nowrap px-4 py-3 text-gray-500">{formatDate(c.createdAt)}</td>
                <td className="max-w-[180px] px-4 py-3 text-gray-800">{truncate(c.prompt, 60)}</td>
                <td className="max-w-[180px] px-4 py-3 text-gray-500">{truncate(c.responseText, 60)}</td>
                <td className="px-4 py-3 text-gray-600">{c.totalTokenCount}</td>
                <td className="px-4 py-3 text-gray-600">{c.latencyMs}ms</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.tier === 'byok' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                    {c.tier}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{c.finishReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {calls.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No calls recorded yet.</p>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{total} total calls</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40 hover:bg-gray-50"
            >
              ← Prev
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40 hover:bg-gray-50"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Slide-over detail panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setSelected(null)} />
          <div className="flex w-full max-w-xl flex-col bg-white shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Call detail</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="flex flex-col gap-6 p-6">
              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                <span>{formatDate(selected.createdAt)}</span>
                <span>{selected.totalTokenCount} tokens</span>
                <span>{selected.latencyMs}ms</span>
                <span className="uppercase">{selected.tier}</span>
                <span>{selected.finishReason}</span>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Prompt</p>
                <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-800">{selected.prompt}</pre>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Response</p>
                <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-800">{selected.responseText}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
