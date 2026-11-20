'use client'

import { useEffect, useState, useTransition } from 'react'
import { ChevronDownIcon, MinusIcon, PlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { ReceiptFileInput } from '@/components/receipt-file-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { formatPeriodLabel, generatePeriodRange } from '@/core/domain/period'
import type { EnrichedService } from '@/features/services/application/get-services-board.use-case'
import { MAX_RECEIPT_SIZE_BYTES } from '@/features/services/domain/receipt.policy'
import { registerPaymentAction } from '@/features/services/presentation/actions/service.actions'
import { ReceiptPreviewModal } from '@/features/services/presentation/components/receipt-preview-modal'
import {
  compressImageInBrowser,
  validateClientUploadFile,
} from '@/lib/utils/image-compression'

interface UploadReceiptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: EnrichedService | null
}

export function UploadReceiptDialog({
  open,
  onOpenChange,
  service,
}: UploadReceiptDialogProps) {
  const [monthsCovered, setMonthsCovered] = useState(1)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null)
  const [isProcessingFile, setIsProcessingFile] = useState(false)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    return () => {
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl)
      }
    }
  }, [previewObjectUrl])

  if (!service) {
    return null
  }

  const startPeriod = service.nextPendingPeriod
  const coveredPeriods = generatePeriodRange(startPeriod, monthsCovered)

  function handleStepMonths(delta: number) {
    setMonthsCovered((current) => Math.min(12, Math.max(1, current + delta)))
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      return
    }

    const validation = validateClientUploadFile(file, {
      allowPdf: true,
      maxSizeBytes: MAX_RECEIPT_SIZE_BYTES,
    })
    if (!validation.ok) {
      event.target.value = ''
      toast.error(validation.error)
      return
    }

    setErrorMessage(null)
    setIsProcessingFile(true)

    try {
      const processedFile = await compressImageInBrowser(file)
      if (processedFile.size > MAX_RECEIPT_SIZE_BYTES) {
        event.target.value = ''
        toast.error('El archivo supera el tamaño máximo permitido de 5 MB.')
        return
      }

      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl)
      }

      setSelectedFile(processedFile)
      setPreviewObjectUrl(URL.createObjectURL(processedFile))
    } catch (error) {
      event.target.value = ''
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo procesar el archivo seleccionado.'
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsProcessingFile(false)
    }
  }

  function handleRemoveFile() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl)
    }
    setSelectedFile(null)
    setPreviewObjectUrl(null)
    setErrorMessage(null)
  }

  function handleSheetOpenChange(nextOpen: boolean) {
    if (!nextOpen && previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl)
      setPreviewObjectUrl(null)
      setPreviewModalOpen(false)
      setConfirmSaveOpen(false)
    }
    onOpenChange(nextOpen)
  }

  function handleRequestSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!service) {
      return
    }

    if (!selectedFile) {
      setErrorMessage('Selecciona una imagen o PDF del comprobante.')
      return
    }

    setErrorMessage(null)
    setConfirmSaveOpen(true)
  }

  function handleConfirmSave() {
    if (!service || !selectedFile) {
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.set('serviceId', service.id)
      formData.set('startPeriod', startPeriod)
      formData.set('monthsCovered', String(monthsCovered))
      formData.set('file', selectedFile)

      const result = await registerPaymentAction(formData)

      if (!result.ok) {
        setConfirmSaveOpen(false)
        setErrorMessage(result.error)
        return
      }

      setConfirmSaveOpen(false)
      toast.success(
        monthsCovered > 1
          ? `Comprobante registrado para ${monthsCovered} meses.`
          : `Comprobante de ${formatPeriodLabel(startPeriod)} registrado.`
      )
      handleSheetOpenChange(false)
    })
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleSheetOpenChange}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>Subir recibo — {service.name}</SheetTitle>
            <SheetDescription>
              Periodo a registrar:{' '}
              <span className="font-medium text-foreground">
                {formatPeriodLabel(startPeriod)}
              </span>
            </SheetDescription>
          </SheetHeader>

          <form
            onSubmit={handleRequestSubmit}
            className="flex flex-1 flex-col px-4"
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="receipt-file-input">
                  Comprobante de pago (imagen o PDF, máx. 5 MB)
                </FieldLabel>
                <ReceiptFileInput
                  id="receipt-file-input"
                  file={selectedFile}
                  previewUrl={previewObjectUrl}
                  isProcessing={isProcessingFile}
                  disabled={isPending}
                  placeholderTitle="Seleccionar foto o PDF del recibo"
                  onFileChange={handleFileChange}
                  onRemove={handleRemoveFile}
                  onOpenFullPreview={() => setPreviewModalOpen(true)}
                />
              </Field>

              <Collapsible open={advanceOpen} onOpenChange={setAdvanceOpen}>
                <CollapsibleTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between px-2 text-muted-foreground"
                    />
                  }
                >
                  <span>¿Pagaste varios meses adelantados?</span>
                  <ChevronDownIcon
                    className={`size-4 transition-transform ${
                      advanceOpen ? 'rotate-180' : ''
                    }`}
                  />
                </CollapsibleTrigger>

                <CollapsibleContent className="pt-3">
                  <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        Meses cubiertos
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-xs"
                          onClick={() => handleStepMonths(-1)}
                          disabled={monthsCovered <= 1}
                          aria-label="Disminuir meses"
                        >
                          <MinusIcon />
                        </Button>
                        <span className="w-8 text-center text-sm font-semibold">
                          {monthsCovered}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-xs"
                          onClick={() => handleStepMonths(1)}
                          disabled={monthsCovered >= 12}
                          aria-label="Aumentar meses"
                        >
                          <PlusIcon />
                        </Button>
                      </div>
                    </div>

                    <FieldDescription>
                      Este comprobante marcará como pagados los siguientes
                      periodos:
                    </FieldDescription>

                    <div className="flex flex-wrap gap-1.5">
                      {coveredPeriods.map((period) => (
                        <Badge key={period} variant="secondary">
                          {formatPeriodLabel(period)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {errorMessage && <FieldError>{errorMessage}</FieldError>}
            </FieldGroup>

            <SheetFooter className="px-0 pt-6">
              <div className="flex w-full justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSheetOpenChange(false)}
                  disabled={isPending || isProcessingFile}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || isProcessingFile || !selectedFile}
                >
                  {isPending ? 'Subiendo recibo...' : 'Registrar pago'}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ReceiptPreviewModal
        open={previewModalOpen}
        onOpenChange={setPreviewModalOpen}
        title={`${service.name} — ${formatPeriodLabel(startPeriod)}`}
        subtitle={
          selectedFile ? `Vista previa local: ${selectedFile.name}` : undefined
        }
        previewUrl={previewObjectUrl}
        fileType={selectedFile?.type}
        fileName={selectedFile?.name}
      />

      <ConfirmDialog
        open={confirmSaveOpen}
        onOpenChange={setConfirmSaveOpen}
        title="Confirmar guardado de comprobante"
        description="¿Estás seguro de guardar este comprobante? Recuerda que una vez registrado no se puede editar ni reemplazar."
        cancelLabel="Revisar archivo"
        confirmLabel={isPending ? 'Guardando...' : 'Sí, guardar comprobante'}
        isLoading={isPending}
        onConfirm={handleConfirmSave}
      />
    </>
  )
}
