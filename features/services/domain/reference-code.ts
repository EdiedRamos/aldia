import { parsePeriod } from '@/core/domain/period'

/**
 * Resolves dynamic tokens `{YYYY}`, `{YY}`, and `{MM}` in a payment reference template
 * using the target period (`"YYYY-MM"`), leaving any fixed text intact.
 */
export function resolveReferenceCode(
  template: string | undefined,
  targetPeriod: string
): string {
  if (!template) {
    return ''
  }

  const { year, month } = parsePeriod(targetPeriod)
  const yyyy = String(year).padStart(4, '0')
  const yy = yyyy.slice(-2)
  const mm = String(month).padStart(2, '0')

  return template
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yy)
    .replace(/\{MM\}/g, mm)
}
