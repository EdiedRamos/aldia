export type Period = string

export const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

export function isValidPeriod(period: string): period is Period {
  return PERIOD_REGEX.test(period)
}

export function parsePeriod(period: string): { year: number; month: number } {
  if (!isValidPeriod(period)) {
    throw new Error(`Invalid period format: "${period}". Expected YYYY-MM`)
  }

  const [yearStr, monthStr] = period.split('-')
  return {
    year: Number(yearStr),
    month: Number(monthStr),
  }
}

export function formatPeriod(year: number, month: number): Period {
  const paddedYear = String(year).padStart(4, '0')
  const paddedMonth = String(month).padStart(2, '0')
  return `${paddedYear}-${paddedMonth}`
}

export function getCurrentPeriod(date: Date = new Date()): Period {
  return formatPeriod(date.getFullYear(), date.getMonth() + 1)
}

export function getNextPeriod(period: string): Period {
  const { year, month } = parsePeriod(period)

  if (month === 12) {
    return formatPeriod(year + 1, 1)
  }

  return formatPeriod(year, month + 1)
}

export function generatePeriodRange(
  startPeriod: string,
  monthsCount: number
): Period[] {
  parsePeriod(startPeriod)

  if (!Number.isInteger(monthsCount) || monthsCount < 1) {
    throw new Error(
      `monthsCount must be an integer greater than or equal to 1. Received: ${monthsCount}`
    )
  }

  const periods: Period[] = [startPeriod]
  let current = startPeriod

  for (let i = 1; i < monthsCount; i += 1) {
    current = getNextPeriod(current)
    periods.push(current)
  }

  return periods
}

export function comparePeriods(a: string, b: string): -1 | 0 | 1 {
  const parsedA = parsePeriod(a)
  const parsedB = parsePeriod(b)

  if (parsedA.year !== parsedB.year) {
    return parsedA.year < parsedB.year ? -1 : 1
  }

  if (parsedA.month !== parsedB.month) {
    return parsedA.month < parsedB.month ? -1 : 1
  }

  return 0
}

export function formatPeriodLabel(
  period: string,
  locale: string = 'es-CO'
): string {
  const { year, month } = parsePeriod(period)
  const date = new Date(Date.UTC(year, month - 1, 1))
  const monthName = new Intl.DateTimeFormat(locale, {
    month: 'long',
    timeZone: 'UTC',
  }).format(date)

  const capitalizedMonth =
    monthName.charAt(0).toUpperCase() + monthName.slice(1)

  return `${capitalizedMonth} ${year}`
}
