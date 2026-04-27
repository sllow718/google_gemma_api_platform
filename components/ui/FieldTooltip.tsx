'use client'

import { useState } from 'react'

export function FieldTooltip({ content }: { content: string }) {
  const [show, setShow] = useState(false)

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-500 hover:bg-gray-300 hover:text-gray-700 focus:outline-none"
        aria-label="More information"
      >
        i
      </button>
      {show && (
        <div
          role="tooltip"
          className="absolute left-6 top-1/2 z-50 w-64 -translate-y-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white shadow-xl text-justify"
        >
          {content}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
        </div>
      )}
    </span>
  )
}
