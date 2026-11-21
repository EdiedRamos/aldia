'use client'

import Link from 'next/link'
import { cn } from 'cn'
import {
  ArrowRightIcon,
  BanknoteIcon,
  CheckCircle2Icon,
  PercentIcon,
  RadarIcon,
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
import type { CalendarEventItem } from '@/features/dashboard/domain/dashboard.types'
import { formatCurrency } from '@/features/loans/domain/loan.entity'
import {
  diffCalendarDays,
  formatIsoDateDisplay,
} from '@/features/loans/domain/loan-schedule.calculator'

interface UpcomingRadarProps {
  events: CalendarEventItem[]
  todayIso: string
  onSelectDate: (isoDate: string) => void
}

function getRelativeDayLabel(
  eventDate: string,
  todayIso: string
): { label: string; urgent: boolean } {
  const diff = diffCalendarDays(todayIso, eventDate)
  if (diff <= 0) {
    return { label: 'Hoy', urgent: true }
  }
  if (diff === 1) {
    return { label: 'Mañana', urgent: true }
  }
  return { label: `En ${diff} días`, urgent: diff <= 3 }
}

export function UpcomingRadar({
  events,
  todayIso,
  onSelectDate,
}: UpcomingRadarProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <RadarIcon className="size-4 text-muted-foreground" />
            <span>Radar de Próximos 7 Días</span>
          </CardTitle>
          <CardDescription>
            Compromisos más cercanos a partir de hoy para acción rápida
          </CardDescription>
        </div>

        <Badge variant="outline" className="tabular-nums">
          {events.length} {events.length === 1 ? 'pendiente' : 'pendientes'}
        </Badge>
      </CardHeader>

      <CardContent>
        {events.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
            <CheckCircle2Icon className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              No tienes servicios ni cobros pendientes en los próximos 7 días.
            </span>
          </div>
        ) : (
          <div className="divide-y rounded-xl border">
            {events.map((event) => {
              const relative = getRelativeDayLabel(event.date, todayIso)
              const isService = event.type === 'SERVICE_DUE'
              const targetHref = isService ? '/servicios' : '/prestamos'

              return (
                <div
                  key={event.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <button
                    type="button"
                    onClick={() => onSelectDate(event.date)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                  >
                    <div
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-lg border',
                        isService
                          ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400'
                      )}
                    >
                      {isService ? (
                        <ReceiptTextIcon className="size-4" />
                      ) : event.type === 'LOAN_OPEN_INTEREST' ? (
                        <PercentIcon className="size-4" />
                      ) : (
                        <BanknoteIcon className="size-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {event.title}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[11px]',
                            relative.urgent
                              ? 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                              : 'text-muted-foreground'
                          )}
                        >
                          {relative.label}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatIsoDateDisplay(event.date)} · {event.subtitle}
                      </p>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-2.5">
                    {event.amount !== null ? (
                      <span className="text-sm font-semibold tabular-nums">
                        {formatCurrency(event.amount)}
                      </span>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-amber-500/25 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-400"
                      >
                        Servicio
                      </Badge>
                    )}

                    <Button
                      variant="ghost"
                      size="xs"
                      nativeButton={false}
                      render={<Link href={targetHref} />}
                    >
                      <span>{isService ? 'Servicios' : 'Préstamos'}</span>
                      <ArrowRightIcon className="size-3" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
