import { passwordStrength } from '@/lib/passwordStrength'

describe('passwordStrength', () => {
  it('returns weak for empty string', () => {
    expect(passwordStrength('')).toBe('weak')
  })

  it('returns weak for short password with no complexity', () => {
    expect(passwordStrength('abc')).toBe('weak')
  })

  it('returns weak for password under 8 chars even with complexity', () => {
    expect(passwordStrength('Ab1!')).toBe('weak')
  })

  it('returns medium for 8+ chars with only some complexity', () => {
    // length ok, has uppercase, no digit, no special
    expect(passwordStrength('Abcdefgh')).toBe('medium')
  })

  it('returns medium for 8+ chars with digit but no uppercase or special', () => {
    expect(passwordStrength('abcdefg1')).toBe('medium')
  })

  it('returns strong for 8+ chars with uppercase, digit, and special char', () => {
    expect(passwordStrength('Abcdef1!')).toBe('strong')
  })

  it('returns strong for a longer complex password', () => {
    expect(passwordStrength('MyP@ssw0rd')).toBe('strong')
  })
})
