'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  MessageCircleIcon,
  PlusIcon,
  RotateCcwIcon,
  SaveIcon,
  SparklesIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  MAX_WHATSAPP_TEMPLATE_LENGTH,
  renderWhatsAppLoanMessage,
  WHATSAPP_TEMPLATE_VARIABLES,
  type WhatsAppMessageTemplates,
} from '@/features/loans/domain/loan-whatsapp-template'
import { updateWhatsAppTemplatesAction } from '@/features/loans/presentation/actions/loan.actions'

interface WhatsAppTemplatesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTemplates: WhatsAppMessageTemplates
  onSaved?: (templates: WhatsAppMessageTemplates) => void
}

const DIRECT_SAMPLE = {
  recipientName: 'Laura Gómez',
  debtorName: 'Laura Gómez',
  amountFormatted: '$250.000',
  dueDateFormatted: '15 dic 2026',
  remainingPrincipalFormatted: '$1.000.000',
}

const THIRD_PARTY_SAMPLE = {
  recipientName: 'Carlos Ruiz',
  debtorName: 'Pedro Pérez',
  amountFormatted: '$150.000',
  dueDateFormatted: '20 dic 2026',
  remainingPrincipalFormatted: '$750.000',
}

type TemplateField = 'directLoanTemplate' | 'thirdPartyLoanTemplate'

export function WhatsAppTemplatesDialog({
  open,
  onOpenChange,
  initialTemplates,
  onSaved,
}: WhatsAppTemplatesDialogProps) {
  const router = useRouter()
  const [directTemplate, setDirectTemplate] = useState(
    initialTemplates.directLoanTemplate
  )
  const [thirdPartyTemplate, setThirdPartyTemplate] = useState(
    initialTemplates.thirdPartyLoanTemplate
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const directTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const thirdPartyTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  const directPreview = renderWhatsAppLoanMessage({
    template: directTemplate,
    ...DIRECT_SAMPLE,
  })

  const thirdPartyPreview = renderWhatsAppLoanMessage({
    template: thirdPartyTemplate,
    ...THIRD_PARTY_SAMPLE,
  })

  function handleInsertVariable(field: TemplateField, token: string) {
    const textarea =
      field === 'directLoanTemplate'
        ? directTextareaRef.current
        : thirdPartyTextareaRef.current
    const currentValue =
      field === 'directLoanTemplate' ? directTemplate : thirdPartyTemplate
    const setValue =
      field === 'directLoanTemplate' ? setDirectTemplate : setThirdPartyTemplate

    if (!textarea) {
      const nextValue = `${currentValue}${currentValue && !currentValue.endsWith(' ') ? ' ' : ''}${token}`
      setValue(nextValue.slice(0, MAX_WHATSAPP_TEMPLATE_LENGTH))
      return
    }

    const start = textarea.selectionStart ?? currentValue.length
    const end = textarea.selectionEnd ?? currentValue.length
    const nextValue = (
      currentValue.slice(0, start) +
      token +
      currentValue.slice(end)
    ).slice(0, MAX_WHATSAPP_TEMPLATE_LENGTH)

    setValue(nextValue)
    setErrorMessage(null)

    requestAnimationFrame(() => {
      textarea.focus()
      const nextCursor = Math.min(start + token.length, nextValue.length)
      textarea.setSelectionRange(nextCursor, nextCursor)
    })
  }

  function handleRestoreDefaults() {
    setDirectTemplate(DEFAULT_WHATSAPP_TEMPLATES.directLoanTemplate)
    setThirdPartyTemplate(DEFAULT_WHATSAPP_TEMPLATES.thirdPartyLoanTemplate)
    setErrorMessage(null)
    toast.info(
      'Plantillas restauradas por defecto. Pulsa "Guardar plantillas" para aplicar.'
    )
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    if (!directTemplate.trim() || !thirdPartyTemplate.trim()) {
      setErrorMessage('Ambas plantillas deben contener texto.')
      return
    }

    startTransition(async () => {
      const result = await updateWhatsAppTemplatesAction({
        directLoanTemplate: directTemplate,
        thirdPartyLoanTemplate: thirdPartyTemplate,
      })

      if (!result.ok) {
        setErrorMessage(result.error)
        toast.error(result.error)
        return
      }

      toast.success('Plantillas de WhatsApp guardadas correctamente.')
      onSaved?.(result.templates)
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircleIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span>Plantillas de WhatsApp</span>
          </DialogTitle>
          <DialogDescription>
            Personaliza los mensajes manuales que se abren en WhatsApp desde tus
            préstamos y el calendario del Dashboard. Usa las variables dinámicas
            para insertar datos reales automáticamente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* 1. Direct Loan Template */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="direct-loan-template" className="font-medium">
                Préstamo directo
              </Label>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {directTemplate.length} / {MAX_WHATSAPP_TEMPLATE_LENGTH}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {WHATSAPP_TEMPLATE_VARIABLES.map((variable) => (
                <button
                  key={`direct-${variable.key}`}
                  type="button"
                  onClick={() =>
                    handleInsertVariable('directLoanTemplate', variable.token)
                  }
                  title={variable.label}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
                >
                  <PlusIcon className="size-3 text-muted-foreground" />
                  <span className="font-mono text-[11px]">
                    {variable.token}
                  </span>
                </button>
              ))}
            </div>

            <textarea
              ref={directTextareaRef}
              id="direct-loan-template"
              rows={3}
              maxLength={MAX_WHATSAPP_TEMPLATE_LENGTH}
              value={directTemplate}
              onChange={(event) => {
                setDirectTemplate(event.target.value)
                setErrorMessage(null)
              }}
              placeholder={DEFAULT_WHATSAPP_TEMPLATES.directLoanTemplate}
              className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />

            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                <SparklesIcon className="size-3" />
                <span>Vista previa en tiempo real</span>
              </div>
              <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                {directPreview || (
                  <span className="text-muted-foreground italic">
                    Escribe un mensaje para ver la vista previa...
                  </span>
                )}
              </p>
            </div>
          </div>

          <Separator />

          {/* 2. Third-Party / Guarantor Loan Template */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="third-party-loan-template"
                  className="font-medium"
                >
                  Préstamo a tercero / codeudor
                </Label>
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400"
                >
                  Vía intermediario
                </Badge>
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {thirdPartyTemplate.length} / {MAX_WHATSAPP_TEMPLATE_LENGTH}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {WHATSAPP_TEMPLATE_VARIABLES.map((variable) => (
                <button
                  key={`third-${variable.key}`}
                  type="button"
                  onClick={() =>
                    handleInsertVariable(
                      'thirdPartyLoanTemplate',
                      variable.token
                    )
                  }
                  title={variable.label}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
                >
                  <PlusIcon className="size-3 text-muted-foreground" />
                  <span className="font-mono text-[11px]">
                    {variable.token}
                  </span>
                </button>
              ))}
            </div>

            <textarea
              ref={thirdPartyTextareaRef}
              id="third-party-loan-template"
              rows={3}
              maxLength={MAX_WHATSAPP_TEMPLATE_LENGTH}
              value={thirdPartyTemplate}
              onChange={(event) => {
                setThirdPartyTemplate(event.target.value)
                setErrorMessage(null)
              }}
              placeholder={DEFAULT_WHATSAPP_TEMPLATES.thirdPartyLoanTemplate}
              className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />

            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                <SparklesIcon className="size-3" />
                <span>Vista previa en tiempo real (enviado al codeudor)</span>
              </div>
              <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                {thirdPartyPreview || (
                  <span className="text-muted-foreground italic">
                    Escribe un mensaje para ver la vista previa...
                  </span>
                )}
              </p>
            </div>
          </div>

          {errorMessage && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {errorMessage}
            </p>
          )}

          <DialogFooter className="items-center justify-between gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRestoreDefaults}
              disabled={isPending}
            >
              <RotateCcwIcon className="size-3.5" />
              <span>Restaurar por defecto</span>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                <SaveIcon className="size-3.5" />
                <span>{isPending ? 'Guardando...' : 'Guardar plantillas'}</span>
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
