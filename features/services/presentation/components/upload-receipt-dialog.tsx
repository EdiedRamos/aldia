'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  ChevronDownIcon,
  EyeIcon,
  FileTextIcon,
  ImageIcon,
  MinusIcon,
  PlusIcon,
  UploadIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
import { registerPaymentAction } from '@/features/services/presentation/actions/service.actions'
import { ReceiptPreviewModal } from '@/features/services/presentation/components/receipt-preview-modal'
import { compressImageInBrowser } from '@/lib/utils/image-compression'

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
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
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

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null

    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl)
    }

    setSelectedFile(file)
    setPreviewObjectUrl(file ? URL.createObjectURL(file) : null)
    setErrorMessage(null)
  }

  function handleSheetOpenChange(nextOpen: boolean) {
    if (!nextOpen && previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl)
      setPreviewObjectUrl(null)
      setPreviewModalOpen(false)
    }
    onOpenChange(nextOpen)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!service) {
      return
    }

    if (!selectedFile) {
      setErrorMessage('Selecciona una imagen o PDF del comprobante.')
      return
    }

    setErrorMessage(null)

    startTransition(async () => {
      const processedFile = await compressImageInBrowser(selectedFile)

      const formData = new FormData()
      formData.set('serviceId', service.id)
      formData.set('startPeriod', startPeriod)
      formData.set('monthsCovered', String(monthsCovered))
      formData.set('file', processedFile)

      const result = await registerPaymentAction(formData)

      if (!result.ok) {
        setErrorMessage(result.error)
        return
      }

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

          <form onSubmit={handleSubmit} className="flex flex-1 flex-col px-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="receipt-file-input">
                  Comprobante de pago (imagen o PDF, máx. 5 MB)
                </FieldLabel>
                <label
                  htmlFor="receipt-file-input"
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center transition-colors hover:bg-muted/60"
                >
                  {selectedFile ? (
                    <>
                      {selectedFile.type === 'application/pdf' ? (
                        <FileTextIcon className="size-8 text-primary" />
                      ) : (
                        <ImageIcon className="size-8 text-primary" />
                      )}
                      <span className="max-w-full truncate text-sm font-medium">
                        {selectedFile.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024).toFixed(0)} KB · Haz clic
                        para cambiar
                      </span>
                    </>
                  ) : (
                    <>
                      <UploadIcon className="size-8 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        Seleccionar foto o PDF del recibo
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Las imágenes se optimizan automáticamente antes de subir
                      </span>
                    </>
                  )}
                  <input
                    id="receipt-file-input"
                    type="file"
                    accept="image/*,application/pdf"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>

                {selectedFile && previewObjectUrl && (
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setPreviewModalOpen(true)}
                    >
                      <EyeIcon className="size-3.5" />
                      <span>Ver comprobante seleccionado</span>
                    </Button>
                  </div>
                )}
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
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending || !selectedFile}>
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
    </>
  )
}
