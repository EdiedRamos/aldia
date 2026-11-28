'use client'

import { useState, useTransition } from 'react'
import {
  ArchiveIcon,
  CalendarIcon,
  CopyIcon,
  ExternalLinkIcon,
  HistoryIcon,
  MoreVerticalIcon,
  PencilIcon,
  UploadIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatPeriodLabel } from '@/core/domain/period'
import type { EnrichedService } from '@/features/services/application/get-services-board.use-case'
import {
  getActiveServicePayments,
  type ServiceStatusBadge,
} from '@/features/services/domain/service.entity'
import { archiveServiceAction } from '@/features/services/presentation/actions/service.actions'

interface ServiceCardProps {
  service: EnrichedService
  onEdit: (service: EnrichedService) => void
  onUploadReceipt: (service: EnrichedService) => void
  onViewHistory: (service: EnrichedService) => void
}

const STATUS_BADGE_CONFIG: Record<
  ServiceStatusBadge,
  { label: string; className: string }
> = {
  UP_TO_DATE: {
    label: 'Al día',
    className:
      'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  },
  PENDING: {
    label: 'Pendiente',
    className:
      'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400',
  },
  OVERDUE: {
    label: 'Vencido',
    className: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-400',
  },
  ARCHIVED: {
    label: 'Archivado',
    className: 'border-border bg-muted text-muted-foreground',
  },
}

export function ServiceCard({
  service,
  onEdit,
  onUploadReceipt,
  onViewHistory,
}: ServiceCardProps) {
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false)
  const [isArchiving, startArchiveTransition] = useTransition()
  const badgeConfig = STATUS_BADGE_CONFIG[service.statusBadge]

  async function handleCopyReference() {
    if (!service.resolvedReferenceCode) {
      return
    }

    try {
      await navigator.clipboard.writeText(service.resolvedReferenceCode)
      toast.success('Referencia copiada al portapapeles.')
    } catch {
      toast.error('No se pudo copiar la referencia.')
    }
  }

  function handleConfirmArchive() {
    startArchiveTransition(async () => {
      const result = await archiveServiceAction(service.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setConfirmArchiveOpen(false)
      toast.success(`Servicio "${service.name}" archivado.`)
    })
  }

  return (
    <>
      <Card className="flex flex-col justify-between">
        <div>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="truncate">{service.name}</CardTitle>
              <Badge variant="outline" className={badgeConfig.className}>
                {badgeConfig.label}
              </Badge>
            </div>
            <CardDescription className="flex items-center gap-1.5 pt-0.5">
              <CalendarIcon className="size-3.5 shrink-0" />
              <span>Día {service.billingDay} de cada mes</span>
            </CardDescription>

            <CardAction>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Opciones del servicio"
                    />
                  }
                >
                  <MoreVerticalIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => onEdit(service)}>
                    <PencilIcon />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onViewHistory(service)}>
                    <HistoryIcon />
                    Ver historial de recibos
                  </DropdownMenuItem>
                  {service.status === 'ACTIVE' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setConfirmArchiveOpen(true)}
                        disabled={isArchiving}
                      >
                        <ArchiveIcon />
                        Archivar servicio
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </CardAction>
          </CardHeader>

          <CardContent className="flex flex-col gap-3 pt-2">
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
              {service.statusBadge === 'UP_TO_DATE' &&
              service.coveredUntilPeriod ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Cubierto hasta:</span>
                  <span className="font-medium text-foreground">
                    {formatPeriodLabel(service.coveredUntilPeriod)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Próximo a pagar:
                  </span>
                  <span className="font-medium text-foreground">
                    {formatPeriodLabel(service.nextPendingPeriod)}
                  </span>
                </div>
              )}
            </div>

            {service.resolvedReferenceCode && (
              <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[11px] text-muted-foreground">
                    Referencia ({formatPeriodLabel(service.nextPendingPeriod)})
                  </span>
                  <code className="truncate font-mono text-xs font-semibold">
                    {service.resolvedReferenceCode}
                  </code>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleCopyReference}
                  aria-label="Copiar referencia"
                >
                  <CopyIcon className="size-3.5" />
                </Button>
              </div>
            )}
          </CardContent>
        </div>

        <CardFooter className="mt-4 flex items-center justify-between gap-2">
          {service.paymentUrl ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              nativeButton={false}
              render={
                <a
                  href={service.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <span>Ir a pagar</span>
              <ExternalLinkIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onViewHistory(service)}
            >
              <HistoryIcon className="size-3.5" />
              <span>
                Recibos ({getActiveServicePayments(service.payments).length})
              </span>
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            className="flex-1"
            onClick={() => onUploadReceipt(service)}
          >
            <UploadIcon className="size-3.5" />
            <span>Subir recibo</span>
          </Button>
        </CardFooter>
      </Card>

      <ConfirmDialog
        open={confirmArchiveOpen}
        onOpenChange={setConfirmArchiveOpen}
        title={`¿Archivar "${service.name}"?`}
        description={`El servicio "${service.name}" dejará de aparecer en tu lista de servicios activos, pero conservará intacto todo su historial de pagos y comprobantes en la pestaña de Archivados.`}
        confirmLabel={isArchiving ? 'Archivando...' : 'Archivar servicio'}
        cancelLabel="Cancelar"
        variant="destructive"
        isLoading={isArchiving}
        onConfirm={handleConfirmArchive}
      />
    </>
  )
}
