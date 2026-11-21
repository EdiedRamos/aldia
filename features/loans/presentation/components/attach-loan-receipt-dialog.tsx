'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ReceiptFileInput } from '@/components/receipt-file-input'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { MAX_LOAN_RECEIPT_SIZE_BYTES } from '@/features/loans/domain/loan.policy'
import {
  attachLoanDisbursementReceiptAction,
  attachLoanPaymentReceiptAction,
} from '@/features/loans/presentation/actions/loan.actions'
import { ReceiptPreviewModal } from '@/features/services/presentation/components/receipt-preview-modal'
import {
  compressImageInBrowser,
  validateClientUploadFile,
} from '@/lib/utils/image-compression'

export type LoanReceiptAttachTarget =
  | {
      kind: 'disbursement'
      loanId: string
      title: string
      subtitle?: string
    }
  | {
      kind: 'payment'
      loanId: string
      paymentId: string
      title: string
      subtitle?: string
    }

interface AttachLoanReceiptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: LoanReceiptAttachTarget | null
}

export function AttachLoanReceiptDialog({
  open,
  onOpenChange,
  target,
}: AttachLoanReceiptDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null)
  const [isProcessingFile, setIsProcessingFile] = useState(false)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    return () => {
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl)
      }
    }
  }, [previewObjectUrl])

  if (!target) {
    return null
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      return
    }

    const validation = validateClientUploadFile(file, {
      allowPdf: true,
      maxSizeBytes: MAX_LOAN_RECEIPT_SIZE_BYTES,
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
      if (processedFile.size > MAX_LOAN_RECEIPT_SIZE_BYTES) {
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

  function handleDialogOpenChange(nextOpen: boolean) {
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
    if (!selectedFile) {
      setErrorMessage('Selecciona una imagen o PDF del comprobante.')
      return
    }

    setErrorMessage(null)
    setConfirmSaveOpen(true)
  }

  function handleConfirmSave() {
    if (!target || !selectedFile) {
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.set('loanId', target.loanId)
      formData.set('receipt', selectedFile)

      const result =
        target.kind === 'disbursement'
          ? await attachLoanDisbursementReceiptAction(formData)
          : (() => {
              formData.set('paymentId', target.paymentId)
              return attachLoanPaymentReceiptAction(formData)
            })()

      const resolved = await result
      if (!resolved.ok) {
        setConfirmSaveOpen(false)
        setErrorMessage(resolved.error)
        return
      }

      setConfirmSaveOpen(false)
      toast.success('Comprobante guardado correctamente.')
      handleDialogOpenChange(false)
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjuntar comprobante</DialogTitle>
            <DialogDescription>
              {target.title}
              {target.subtitle ? ` · ${target.subtitle}` : ''}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRequestSubmit} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="attach-loan-receipt-input">
                Comprobante (imagen o PDF, máx. 5 MB)
              </FieldLabel>
              <ReceiptFileInput
                id="attach-loan-receipt-input"
                file={selectedFile}
                previewUrl={previewObjectUrl}
                isProcessing={isProcessingFile}
                disabled={isPending}
                onFileChange={handleFileChange}
                onRemove={handleRemoveFile}
                onOpenFullPreview={() => setPreviewModalOpen(true)}
              />
            </Field>

            {errorMessage && <FieldError>{errorMessage}</FieldError>}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogOpenChange(false)}
                disabled={isPending || isProcessingFile}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending || isProcessingFile || !selectedFile}
              >
                {isPending ? 'Guardando...' : 'Guardar comprobante'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ReceiptPreviewModal
        open={previewModalOpen}
        onOpenChange={setPreviewModalOpen}
        title={target.title}
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
