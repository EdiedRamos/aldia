'use client'

import { useState } from 'react'
import { PlusIcon, ReceiptTextIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
  EnrichedService,
  ServicesBoard,
} from '@/features/services/application/get-services-board.use-case'
import { PaymentHistorySheet } from '@/features/services/presentation/components/payment-history-sheet'
import { ServiceCard } from '@/features/services/presentation/components/service-card'
import { ServiceFormDialog } from '@/features/services/presentation/components/service-form-dialog'
import { UploadReceiptDialog } from '@/features/services/presentation/components/upload-receipt-dialog'

interface ServicesBoardViewProps {
  board: ServicesBoard
}

export function ServicesBoardView({ board }: ServicesBoardViewProps) {
  const [formOpen, setFormOpen] = useState(false)
  const [editingService, setEditingService] = useState<EnrichedService | null>(
    null
  )
  const [uploadService, setUploadService] = useState<EnrichedService | null>(
    null
  )
  const [historyService, setHistoryService] = useState<EnrichedService | null>(
    null
  )

  function handleOpenCreate() {
    setEditingService(null)
    setFormOpen(true)
  }

  function handleOpenEdit(service: EnrichedService) {
    setEditingService(service)
    setFormOpen(true)
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <Tabs defaultValue="active" className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="active">
              Activos ({board.active.length})
            </TabsTrigger>
            <TabsTrigger value="archived">
              Archivados ({board.archived.length})
            </TabsTrigger>
          </TabsList>

          <Button onClick={handleOpenCreate} size="sm">
            <PlusIcon />
            <span>Nuevo Servicio</span>
          </Button>
        </div>

        <TabsContent value="active" className="pt-4">
          {board.active.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <ReceiptTextIcon className="size-6 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-base font-medium">
                No tienes servicios activos
              </h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Agrega tus servicios públicos, internet o arriendo para llevar
                el control de fechas de corte y comprobantes de pago.
              </p>
              <Button onClick={handleOpenCreate} size="sm" className="mt-4">
                <PlusIcon />
                <span>Nuevo Servicio</span>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {board.active.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  onEdit={handleOpenEdit}
                  onUploadReceipt={(target) => setUploadService(target)}
                  onViewHistory={(target) => setHistoryService(target)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="archived" className="pt-4">
          {board.archived.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center text-muted-foreground">
              <p className="text-sm font-medium">
                No tienes servicios archivados
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {board.archived.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  onEdit={handleOpenEdit}
                  onUploadReceipt={(target) => setUploadService(target)}
                  onViewHistory={(target) => setHistoryService(target)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {formOpen && (
        <ServiceFormDialog
          key={editingService?.id ?? 'new-service'}
          open={formOpen}
          onOpenChange={setFormOpen}
          service={editingService}
        />
      )}

      {uploadService && (
        <UploadReceiptDialog
          key={`${uploadService.id}-${uploadService.nextPendingPeriod}`}
          open={Boolean(uploadService)}
          onOpenChange={(open) => {
            if (!open) {
              setUploadService(null)
            }
          }}
          service={uploadService}
        />
      )}

      {historyService && (
        <PaymentHistorySheet
          key={historyService.id}
          open={Boolean(historyService)}
          onOpenChange={(open) => {
            if (!open) {
              setHistoryService(null)
            }
          }}
          service={historyService}
        />
      )}
    </div>
  )
}
