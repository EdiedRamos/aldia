'use client'

import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  HandCoinsIcon,
  ReceiptTextIcon,
  WalletIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { DashboardSummary } from '@/features/dashboard/domain/dashboard.types'
import {
  formatCurrency,
  roundCurrency,
} from '@/features/loans/domain/loan.entity'

interface DashboardKpiCardsProps {
  summary: DashboardSummary
  upcoming3DaysCount: number
  periodLabel: string
}

export function DashboardKpiCards({
  summary,
  upcoming3DaysCount,
  periodLabel,
}: DashboardKpiCardsProps) {
  const servicesPending = Math.max(
    0,
    summary.servicesTotalDue - summary.servicesPaid
  )
  const servicesProgress =
    summary.servicesTotalDue > 0
      ? Math.round((summary.servicesPaid / summary.servicesTotalDue) * 100)
      : 100

  const loansPendingCollection = roundCurrency(
    Math.max(0, summary.loansExpectedCollection - summary.loansCollected)
  )
  const loansCollectionProgress =
    summary.loansExpectedCollection > 0
      ? Math.min(
          100,
          Math.round(
            (summary.loansCollected / summary.loansExpectedCollection) * 100
          )
        )
      : 0

  const hasUrgentItems = summary.overdueCount > 0 || upcoming3DaysCount > 0

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1. Servicios del Mes */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardDescription className="flex items-center gap-1.5">
              <ReceiptTextIcon className="size-3.5 text-amber-600 dark:text-amber-400" />
              <span>Servicios del Mes</span>
            </CardDescription>
            {summary.servicesTotalDue > 0 && (
              <Badge
                variant="outline"
                className={
                  servicesPending === 0
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                }
              >
                {servicesProgress}%
              </Badge>
            )}
          </div>
          <CardTitle className="text-2xl font-semibold tabular-nums">
            {summary.servicesPaid}{' '}
            <span className="text-base font-normal text-muted-foreground">
              / {summary.servicesTotalDue} pagados
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-0">
          {summary.servicesTotalDue > 0 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-amber-500 transition-all dark:bg-amber-400"
                style={{ width: `${servicesProgress}%` }}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {summary.servicesTotalDue === 0
              ? `Sin servicios activos en ${periodLabel}`
              : servicesPending === 0
                ? 'Todos los servicios del mes al día'
                : `${servicesPending} ${servicesPending === 1 ? 'servicio pendiente' : 'servicios pendientes'} en ${periodLabel}`}
          </p>
        </CardContent>
      </Card>

      {/* 2. Cobros Esperados del Mes */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardDescription className="flex items-center gap-1.5">
              <HandCoinsIcon className="size-3.5 text-blue-600 dark:text-blue-400" />
              <span>Cobros Esperados</span>
            </CardDescription>
            {summary.loansExpectedCollection > 0 && (
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 tabular-nums dark:text-emerald-400"
              >
                {loansCollectionProgress}%
              </Badge>
            )}
          </div>
          <CardTitle className="text-2xl font-semibold tabular-nums">
            {formatCurrency(summary.loansExpectedCollection)}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-0">
          {summary.loansExpectedCollection > 0 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all dark:bg-emerald-400"
                style={{ width: `${loansCollectionProgress}%` }}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs">
            <span className="font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
              Recaudado: {formatCurrency(summary.loansCollected)}
            </span>
            <span className="text-muted-foreground tabular-nums">
              Pend.: {formatCurrency(loansPendingCollection)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 3. Capital Activo Prestado */}
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1.5">
            <WalletIcon className="size-3.5 text-primary" />
            <span>Capital Activo Prestado</span>
          </CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums">
            {formatCurrency(summary.activePrincipalTotal)}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">
            {summary.activePrincipalTotal > 0
              ? 'Capital vigente pendiente de recuperación'
              : 'Sin capital activo prestado actualmente'}
          </p>
        </CardContent>
      </Card>

      {/* 4. Vencidos / Próximos 3 días */}
      <Card
        className={
          summary.overdueCount > 0
            ? 'border-destructive/40'
            : upcoming3DaysCount > 0
              ? 'border-amber-500/40'
              : undefined
        }
      >
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1.5">
            {summary.overdueCount > 0 ? (
              <AlertTriangleIcon className="size-3.5 text-destructive" />
            ) : upcoming3DaysCount > 0 ? (
              <CalendarClockIcon className="size-3.5 text-amber-600 dark:text-amber-400" />
            ) : (
              <CheckCircle2Icon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            )}
            <span>Vencidos / Próximos 3 días</span>
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle
              className={`text-2xl font-semibold tabular-nums ${
                summary.overdueCount > 0 ? 'text-destructive' : ''
              }`}
            >
              {summary.overdueCount}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                {summary.overdueCount === 1 ? 'vencido' : 'vencidos'}
              </span>
            </CardTitle>
            {upcoming3DaysCount > 0 && (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-amber-700 tabular-nums dark:text-amber-400"
              >
                {upcoming3DaysCount} en 3d
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">
            {!hasUrgentItems
              ? 'Sin vencimientos urgentes ni atrasos'
              : summary.overdueCount > 0 && upcoming3DaysCount > 0
                ? `${summary.overdueCount} en mora en ${periodLabel} y ${upcoming3DaysCount} por vencer pronto`
                : summary.overdueCount > 0
                  ? `Compromisos vencidos en ${periodLabel}`
                  : `${upcoming3DaysCount} ${upcoming3DaysCount === 1 ? 'compromiso próximo' : 'compromisos próximos'} en los siguientes 3 días`}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
