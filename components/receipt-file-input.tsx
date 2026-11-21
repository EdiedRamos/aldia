'use client'

import { useRef } from 'react'
import {
  EyeIcon,
  FileTextIcon,
  ImageIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RECEIPT_FILE_ACCEPT } from '@/lib/utils/image-compression'
import { parseSafeDownloadUrl } from '@/lib/utils/safe-download'

interface ReceiptFileInputProps {
  id: string
  file: File | null
  previewUrl: string | null
  isProcessing?: boolean
  disabled?: boolean
  placeholderTitle?: string
  placeholderHint?: string
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: () => void
  onOpenFullPreview?: () => void
}

export function ReceiptFileInput({
  id,
  file,
  previewUrl,
  isProcessing = false,
  disabled = false,
  placeholderTitle = 'Seleccionar foto o PDF del comprobante',
  placeholderHint = 'JPG, PNG, WebP, HEIC o PDF (máx. 5 MB). Vista previa local antes de guardar.',
  onFileChange,
  onRemove,
  onOpenFullPreview,
}: ReceiptFileInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const isPdf = file?.type === 'application/pdf'
  const safeParsedUrl = parseSafeDownloadUrl(previewUrl)
  const safePreviewUrl = safeParsedUrl ? safeParsedUrl.toString() : null

  function handleTriggerChange() {
    if (inputRef.current) {
      inputRef.current.value = ''
      inputRef.current.click()
    }
  }

  function handleClear() {
    if (inputRef.current) {
      inputRef.current.value = ''
    }
    onRemove()
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={RECEIPT_FILE_ACCEPT}
        className="sr-only"
        disabled={disabled || isProcessing}
        onChange={onFileChange}
      />

      {isProcessing ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <LoaderCircleIcon className="size-7 animate-spin text-primary" />
          <span className="text-xs font-medium">
            Procesando archivo en tu navegador...
          </span>
          <span className="text-[11px] text-muted-foreground">
            Convirtiendo y optimizando antes de previsualizar
          </span>
        </div>
      ) : file && safePreviewUrl ? (
        <div className="flex flex-col gap-2.5 rounded-xl border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {isPdf ? (
                <FileTextIcon className="size-4 shrink-0 text-primary" />
              ) : (
                <ImageIcon className="size-4 shrink-0 text-primary" />
              )}
              <span className="truncate text-xs font-medium">{file.name}</span>
            </div>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {isPdf ? 'PDF' : 'JPEG'} · {(file.size / 1024).toFixed(0)} KB
            </Badge>
          </div>

          <div className="overflow-hidden rounded-lg border bg-background">
            {isPdf ? (
              <iframe
                src={safePreviewUrl}
                title={`Vista previa de ${file.name}`}
                className="h-52 w-full border-0"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={safePreviewUrl}
                alt={`Vista previa de ${file.name}`}
                className="max-h-52 w-full object-contain"
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenFullPreview && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={disabled}
                onClick={onOpenFullPreview}
              >
                <EyeIcon className="size-3.5" />
                <span>Ampliar</span>
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={disabled}
              onClick={handleTriggerChange}
            >
              <RefreshCwIcon className="size-3.5" />
              <span>Cambiar archivo</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={handleClear}
              className="text-destructive hover:text-destructive"
            >
              <Trash2Icon className="size-3.5" />
              <span>Quitar</span>
            </Button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={id}
          className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center transition-colors hover:bg-muted/60"
        >
          <UploadIcon className="size-7 text-muted-foreground" />
          <span className="text-xs font-medium">{placeholderTitle}</span>
          <span className="text-[11px] text-muted-foreground">
            {placeholderHint}
          </span>
        </label>
      )}
    </div>
  )
}
