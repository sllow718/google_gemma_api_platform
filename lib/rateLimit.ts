// IP rate limiter: 100 req / 15 min per IP
// Uses in-memory Map in development; swap for Vercel KV in production

export async function checkRateLimit(_ip: string): Promise<void> {
  throw new Error('Not implemented')
}
