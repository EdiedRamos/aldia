'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { cn } from 'cn'
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BanknoteIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  MessageCircleIcon,
  PercentIcon,
  ReceiptTextIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatPeriodLabel } from '@/core/domain/period'
import { buildMonthGridDays } from '@/features/dashboard/domain/calendar-aggregator'
import type {
  CalendarEventItem,
  CalendarEventStatus,
  CalendarEventType,
  MonthlyCalendarData,
} from '@/features/dashboard/domain/dashboard.types'
import {
  formatCurrency,
  roundCurrency,
} from '@/features/loans/domain/loan.entity'
import { formatIsoDateDisplay } from '@/features/loans/domain/loan-schedule.calculator'
import {
  buildTemplatedLoanWhatsAppUrl,
  type WhatsAppMessageTemplates,
} from '@/features/loans/domain/loan-whatsapp-template'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const EVENT_STATUS_META: Record<
  CalendarEventStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  OVERDUE: {
    label: 'Vencido',
    badgeClass:
      'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-400',
    dotClass: 'bg-red-500',
  },
  PENDING: {
    label: 'Pendiente',
    badgeClass:
      'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400',
    dotClass: 'bg-amber-500',
  },
  PAID: {
    label: 'Completado',
    badgeClass:
      'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    dotClass: 'bg-emerald-500',
  },
}

const EVENT_TYPE_META: Record<
  CalendarEventType,
  {
    label: string
    href: string
    actionLabel: string
    accentClass: string
    pillClass: string
  }
> = {
  SERVICE_DUE: {
    label: 'Servicio',
    href: '/servicios',
    actionLabel: 'Gestionar en Servicios',
    accentClass: 'text-amber-600 dark:text-amber-400',
    pillClass:
      'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  LOAN_INSTALLMENT: {
    label: 'Cuota',
    href: '/prestamos',
    actionLabel: 'Gestionar en Préstamos',
    accentClass: 'text-blue-600 dark:text-blue-400',
    pillClass:
      'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  },
  LOAN_OPEN_INTEREST: {
    label: 'Interés',
    href: '/prestamos',
    actionLabel: 'Gestionar en Préstamos',
    accentClass: 'text-blue-600 dark:text-blue-400',
    pillClass:
      'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  },
}

function formatCompactCop(amount: number): string {
  const safe = Math.abs(roundCurrency(amount))
  if (safe >= 1_000_000) {
    const millions = safe / 1_000_000
    const formatted =
      millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)
    return `$${formatted.replace('.', ',')}M`
  }
  if (safe >= 1_000) {
    const thousands = Math.round(safe / 1_000)
    return `$${thousands}k`
  }
  return `$${Math.round(safe)}`
}

function formatSelectedDateHeading(isoDate: string): string {
  const [yearStr, monthStr, dayStr] = isoDate.split('-')
  const date = new Date(
    Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr))
  )
  const formatted = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date)

  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function getEventDotColor(event: CalendarEventItem): string {
  if (event.status === 'OVERDUE') {
    return 'bg-red-500'
  }
  if (event.status === 'PAID') {
    return 'bg-emerald-500'
  }
  if (event.type === 'SERVICE_DUE') {
    return 'bg-amber-500'
  }
  return 'bg-blue-500'
}

interface DashboardCalendarProps {
  calendar: MonthlyCalendarData
  whatsAppTemplates: WhatsAppMessageTemplates
  selectedDate: string
  onSelectDate: (isoDate: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onGoToToday: () => void
}

export function DashboardCalendar({
  calendar,
  whatsAppTemplates,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  onGoToToday,
}: DashboardCalendarProps) {
  const periodLabel = formatPeriodLabel(calendar.period)

  const gridDays = useMemo(
    () => buildMonthGridDays(calendar.year, calendar.month),
    [calendar.year, calendar.month]
  )

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>()
    for (const event of calendar.events) {
      const list = map.get(event.date) ?? []
      list.push(event)
      map.set(event.date, list)
    }
    return map
  }, [calendar.events])

  const selectedDayEvents = eventsByDate.get(selectedDate) ?? []
  const selectedDayLoanTotal = roundCurrency(
    selectedDayEvents.reduce((acc, event) => acc + (event.amount ?? 0), 0)
  )

  const [todayYear, todayMonth] = calendar.todayIso.split('-').map(Number)
  const isViewingCurrentMonth =
    calendar.year === todayYear && calendar.month === todayMonth

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* Left: Interactive Monthly Calendar Grid */}
      <Card className="overflow-hidden">
        <CardHeader className="gap-3 border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDaysIcon className="size-4 text-muted-foreground" />
                <span>{periodLabel}</span>
              </CardTitle>
              <CardDescription className="mt-0.5">
                {calendar.events.length === 0
                  ? 'Sin movimientos programados este mes'
                  : `${calendar.events.length} ${calendar.events.length === 1 ? 'movimiento programado' : 'movimientos programados'} en el mes`}
              </CardDescription>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onPrevMonth}
                aria-label="Mes anterior"
              >
                <ChevronLeftIcon className="size-4" />
                <span className="hidden sm:inline">Anterior</span>
              </Button>
              <Button
                type="button"
                variant={isViewingCurrentMonth ? 'secondary' : 'outline'}
                size="sm"
                onClick={onGoToToday}
              >
                Hoy
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onNextMonth}
                aria-label="Mes siguiente"
              >
                <span className="hidden sm:inline">Siguiente</span>
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          </div>

          {/* Color Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-500" />
              <span>Egreso / Servicio</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-blue-500" />
              <span>Ingreso / Préstamo</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span>Completado</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-red-500" />
              <span>Vencido</span>
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-3 sm:p-4">
          {/* Weekday Headers (Monday - Sunday) */}
          <div className="mb-1.5 grid grid-cols-7 gap-1 sm:gap-1.5">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="py-1 text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
              >
                {label}
              </div>
            ))}
          </div>

          {/* Calendar Cells */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {gridDays.map((cell) => {
              const dayEvents = cell.isCurrentMonth
                ? (eventsByDate.get(cell.isoDate) ?? [])
                : []
              const isToday = cell.isoDate === calendar.todayIso
              const isSelected = cell.isoDate === selectedDate
              const hasOverdue = dayEvents.some((e) => e.status === 'OVERDUE')
              const allPaid =
                dayEvents.length > 0 &&
                dayEvents.every((e) => e.status === 'PAID')
              const loanTotal = roundCurrency(
                dayEvents.reduce((acc, e) => acc + (e.amount ?? 0), 0)
              )
              const serviceCount = dayEvents.filter(
                (e) => e.type === 'SERVICE_DUE'
              ).length

              return (
                <button
                  key={cell.isoDate}
                  type="button"
                  disabled={!cell.isCurrentMonth}
                  onClick={() => onSelectDate(cell.isoDate)}
                  aria-label={`${formatSelectedDateHeading(cell.isoDate)}${dayEvents.length > 0 ? `, ${dayEvents.length} movimientos` : ''}`}
                  aria-pressed={isSelected}
                  className={cn(
                    'group relative flex min-h-16 flex-col justify-between rounded-lg border p-1.5 text-left transition-all sm:min-h-22 sm:p-2',
                    cell.isCurrentMonth
                      ? 'cursor-pointer bg-card hover:border-foreground/25 hover:bg-muted/40'
                      : 'cursor-default border-transparent bg-muted/20 text-muted-foreground/35',
                    isToday &&
                      cell.isCurrentMonth &&
                      'border-primary/40 bg-primary/[0.03]',
                    isSelected &&
                      cell.isCurrentMonth &&
                      'border-primary ring-2 ring-primary/25',
                    hasOverdue &&
                      cell.isCurrentMonth &&
                      !isSelected &&
                      'border-red-500/35 bg-red-500/[0.03]'
                  )}
                >
                  {/* Top Row: Day Number & Event Count */}
                  <div className="flex w-full items-center justify-between gap-1">
                    <span
                      className={cn(
                        'inline-flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums',
                        isToday
                          ? 'bg-primary font-semibold text-primary-foreground'
                          : cell.isCurrentMonth
                            ? 'text-foreground'
                            : 'text-muted-foreground/40'
                      )}
                    >
                      {cell.dayNumber}
                    </span>

                    {dayEvents.length > 0 && (
                      <span
                        className={cn(
                          'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums',
                          hasOverdue
                            ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                            : allPaid
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {/* Bottom Indicators: Color Dots + Compact Summary */}
                  {dayEvents.length > 0 && (
                    <div className="mt-1 flex w-full flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-1">
                        {dayEvents.slice(0, 4).map((event) => (
                          <span
                            key={event.id}
                            className={cn(
                              'size-1.5 rounded-full sm:size-2',
                              getEventDotColor(event)
                            )}
                          />
                        ))}
                        {dayEvents.length > 4 && (
                          <span className="text-[9px] leading-none font-medium text-muted-foreground">
                            +{dayEvents.length - 4}
                          </span>
                        )}
                      </div>

                      <div className="hidden truncate text-[10px] leading-tight font-medium tabular-nums sm:block">
                        {loanTotal > 0 ? (
                          <span
                            className={
                              hasOverdue
                                ? 'text-red-600 dark:text-red-400'
                                : allPaid
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-blue-600 dark:text-blue-400'
                            }
                          >
                            +{formatCompactCop(loanTotal)}
                          </span>
                        ) : serviceCount > 0 ? (
                          <span
                            className={
                              hasOverdue
                                ? 'text-red-600 dark:text-red-400'
                                : allPaid
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-amber-600 dark:text-amber-400'
                            }
                          >
                            {serviceCount}{' '}
                            {serviceCount === 1 ? 'serv.' : 'servs.'}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Right (Desktop) / Bottom (Mobile): Selected Day Detail Panel */}
      <Card className="flex flex-col">
        <CardHeader className="border-b pb-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">
                  {formatSelectedDateHeading(selectedDate)}
                </CardTitle>
                {selectedDate === calendar.todayIso && (
                  <Badge variant="secondary" className="text-[11px]">
                    Hoy
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-1">
                {selectedDayEvents.length === 0
                  ? 'Sin compromisos registrados para este día'
                  : `${selectedDayEvents.length} ${selectedDayEvents.length === 1 ? 'movimiento' : 'movimientos'}${selectedDayLoanTotal > 0 ? ` · ${formatCurrency(selectedDayLoanTotal)} en cobros` : ''}`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          {selectedDayEvents.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed px-4 py-10 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                <CalendarDaysIcon className="size-5 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium">Día despejado</p>
              <p className="mt-1 max-w-56 text-xs text-muted-foreground">
                No tienes vencimientos de servicios ni cobros de préstamos en
                esta fecha.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {selectedDayEvents.map((event) => {
                const statusMeta = EVENT_STATUS_META[event.status]
                const typeMeta = EVENT_TYPE_META[event.type]

                return (
                  <div
                    key={event.id}
                    className={cn(
                      'flex flex-col gap-2.5 rounded-xl border p-3 transition-colors',
                      event.status === 'OVERDUE'
                        ? 'border-red-500/35 bg-red-500/[0.03]'
                        : event.status === 'PAID'
                          ? 'border-emerald-500/25 bg-emerald-500/[0.02]'
                          : 'bg-card'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <div
                          className={cn(
                            'flex size-7 shrink-0 items-center justify-center rounded-lg border',
                            typeMeta.pillClass
                          )}
                        >
                          {event.type === 'SERVICE_DUE' ? (
                            <ReceiptTextIcon className="size-3.5" />
                          ) : event.type === 'LOAN_OPEN_INTEREST' ? (
                            <PercentIcon className="size-3.5" />
                          ) : (
                            <BanknoteIcon className="size-3.5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {event.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {event.subtitle}
                          </p>
                        </div>
                      </div>

                      <Badge
                        variant="outline"
                        className={cn('shrink-0', statusMeta.badgeClass)}
                      >
                        {event.status === 'OVERDUE' && (
                          <AlertTriangleIcon className="size-3" />
                        )}
                        {event.status === 'PAID' && (
                          <CheckCircle2Icon className="size-3" />
                        )}
                        {event.status === 'PENDING' && (
                          <ClockIcon className="size-3" />
                        )}
                        <span>{statusMeta.label}</span>
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs">
                      <Badge
                        variant="outline"
                        className={cn('text-[11px]', typeMeta.pillClass)}
                      >
                        {typeMeta.label}
                      </Badge>
                      {event.amount !== null ? (
                        <span className="text-sm font-semibold tabular-nums">
                          {formatCurrency(event.amount)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Pago mensual
                        </span>
                      )}
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between gap-2">
                      <Button
                        variant="outline"
                        size="xs"
                        className="flex-1 justify-between"
                        nativeButton={false}
                        render={<Link href={typeMeta.href} />}
                      >
                        <span>{typeMeta.actionLabel}</span>
                        <ArrowRightIcon className="size-3" />
                      </Button>

                      {event.type !== 'SERVICE_DUE' &&
                        event.phone &&
                        event.status !== 'PAID' && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            nativeButton={false}
                            aria-label={`Escribir por WhatsApp a ${event.isViaIntermediary && event.guarantorName ? event.guarantorName : (event.contactName ?? event.title)}`}
                            render={
                              <a
                                href={buildTemplatedLoanWhatsAppUrl({
                                  phone: event.phone,
                                  templates: whatsAppTemplates,
                                  isViaIntermediary: Boolean(
                                    event.isViaIntermediary
                                  ),
                                  contactName: event.contactName ?? event.title,
                                  guarantorName: event.guarantorName ?? null,
                                  amountFormatted: formatCurrency(
                                    event.amount ?? 0
                                  ),
                                  dueDateFormatted: formatIsoDateDisplay(
                                    event.date
                                  ),
                                  remainingPrincipalFormatted: formatCurrency(
                                    event.remainingPrincipal ??
                                      event.amount ??
                                      0
                                  ),
                                })}
                                target="_blank"
                                rel="noopener noreferrer"
                              />
                            }
                          >
                            <MessageCircleIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                          </Button>
                        )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
