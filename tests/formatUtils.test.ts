import { formatDate, truncate } from '@/lib/formatUtils'

describe('formatDate', () => {
  it('formats a known ISO date as readable month-day-year', () => {
    expect(formatDate('2026-01-15T00:00:00.000Z')).toBe('Jan 15, 2026')
  })

  it('formats a different month and year correctly', () => {
    expect(formatDate('2025-12-31T23:59:59.000Z')).toBe('Dec 31, 2025')
  })

  it('pads single-digit day without leading zero', () => {
    expect(formatDate('2026-03-05T00:00:00.000Z')).toBe('Mar 5, 2026')
  })
})

describe('truncate', () => {
  it('returns text unchanged when at or under the limit', () => {
    expect(truncate('Hello', 10)).toBe('Hello')
    expect(truncate('Hello', 5)).toBe('Hello')
  })

  it('truncates and appends ellipsis when over the limit', () => {
    expect(truncate('Hello world', 5)).toBe('Hello…')
  })

  it('handles empty string', () => {
    expect(truncate('', 10)).toBe('')
  })

  it('truncates exactly at the boundary', () => {
    expect(truncate('abcdef', 3)).toBe('abc…')
  })
})
