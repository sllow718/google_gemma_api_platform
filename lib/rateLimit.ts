const LIMIT = 100
const WINDOW_MS = 15 * 60 * 1000

interface Entry {
  count: number
  windowStart: number
}

const store = new Map<string, Entry>()

export class RateLimitError extends Error {
  readonly code = 'RATE_LIMIT_EXCEEDED'
  constructor() {
    super('Too many requests')
    this.name = 'RateLimitError'
  }
}

export async function checkRateLimit(ip: string): Promise<void> {
  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    store.set(ip, { count: 1, windowStart: now })
    return
  }

  if (entry.count >= LIMIT) {
    throw new RateLimitError()
  }

  entry.count++
}
