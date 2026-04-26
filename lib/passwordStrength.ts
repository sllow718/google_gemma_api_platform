export type PasswordStrength = 'weak' | 'medium' | 'strong'

export function passwordStrength(password: string): PasswordStrength {
  if (password.length < 8) return 'weak'

  let score = 0
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score === 3) return 'strong'
  return 'medium'
}
