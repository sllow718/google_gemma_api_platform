// JWT sign/verify and httpOnly cookie helpers

export function signAccessToken(_payload: { sub: string; email: string; tier: string }): string {
  throw new Error('Not implemented')
}

export function verifyAccessToken(_token: string): { sub: string; email: string; tier: string } {
  throw new Error('Not implemented')
}

export function generateRefreshToken(): string {
  throw new Error('Not implemented')
}
