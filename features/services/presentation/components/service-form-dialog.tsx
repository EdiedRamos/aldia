'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { getCurrentPeriod } from '@/core/domain/period'
import type { EnrichedService } from '@/features/services/application/get-services-board.use-case'
import {
  createServiceAction,
  updateServiceAction,
} from '@/features/services/presentation/actions/service.actions'

interface ServiceFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  service?: EnrichedService | null
}

const REFERENCE_TOKENS = ['{YY}', '{YYYY}', '{MM}'] as const

export function ServiceFormDialog({
  open,
  onOpenChange,
  service,
}: ServiceFormDialogProps) {
  const isEditing = Boolean(service)

  const [name, setName] = useState(service?.name ?? '')
  const [billingDay, setBillingDay] = useState(
    service?.billingDay ? String(service.billingDay) : '15'
  )
  const [startPeriod, setStartPeriod] = useState(
    service?.startPeriod ?? getCurrentPeriod()
  )
  const [paymentUrl, setPaymentUrl] = useState(service?.paymentUrl ?? '')
  const [referenceCode, setReferenceCode] = useState(
    service?.referenceCode ?? ''
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const referenceInputRef = useRef<HTMLInputElement | null>(null)

  function handleInsertToken(token: string) {
    const input = referenceInputRef.current
    if (!input) {
      setReferenceCode((prev) => `${prev}${token}`)
      return
    }

    const start = input.selectionStart ?? referenceCode.length
    const end = input.selectionEnd ?? referenceCode.length
    const nextValue =
      referenceCode.slice(0, start) + token + referenceCode.slice(end)

    setReferenceCode(nextValue)

    requestAnimationFrame(() => {
      input.focus()
      const nextCursor = start + token.length
      input.setSelectionRange(nextCursor, nextCursor)
    })
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    const payload = {
      name: name.trim(),
      billingDay: Number(billingDay),
      startPeriod: startPeriod.trim(),
      paymentUrl: paymentUrl.trim(),
      referenceCode: referenceCode.trim(),
    }

    startTransition(async () => {
      const result =
        isEditing && service
          ? await updateServiceAction(service.id, payload)
          : await createServiceAction(payload)

      if (!result.ok) {
        setErrorMessage(result.error)
        return
      }

      toast.success(
        isEditing
          ? 'Servicio actualizado correctamente.'
          : 'Servicio creado correctamente.'
      )
      onOpenChange(false)
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? 'Editar servicio' : 'Nuevo servicio'}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Actualiza los datos de facturación y referencia del servicio.'
              : 'Registra un servicio o arriendo recurrente para controlar sus pagos.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col px-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="service-name">
                Nombre del servicio
              </FieldLabel>
              <Input
                id="service-name"
                name="name"
                placeholder="Ej. Energía EPM, Internet, Arriendo"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="service-billing-day">
                  Día límite de pago
                </FieldLabel>
                <Input
                  id="service-billing-day"
                  name="billingDay"
                  type="number"
                  min={1}
                  max={31}
                  value={billingDay}
                  onChange={(event) => setBillingDay(event.target.value)}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="service-start-period">
                  Mes inicial
                </FieldLabel>
                <Input
                  id="service-start-period"
                  name="startPeriod"
                  type="month"
                  value={startPeriod}
                  onChange={(event) => setStartPeriod(event.target.value)}
                  required
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="service-payment-url">
                Enlace de pago (opcional)
              </FieldLabel>
              <Input
                id="service-payment-url"
                name="paymentUrl"
                type="url"
                placeholder="https://portal.pagos.com"
                value={paymentUrl}
                onChange={(event) => setPaymentUrl(event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="service-reference-code">
                Código o referencia de pago (opcional)
              </FieldLabel>
              <Input
                ref={referenceInputRef}
                id="service-reference-code"
                name="referenceCode"
                placeholder="Ej. {YY}{MM}987654 o convenio fijo"
                value={referenceCode}
                onChange={(event) => setReferenceCode(event.target.value)}
              />
              <FieldDescription>
                Inserta variables dinámicas que se actualizan cada mes:
              </FieldDescription>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {REFERENCE_TOKENS.map((token) => (
                  <Button
                    key={token}
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => handleInsertToken(token)}
                  >
                    {token}
                  </Button>
                ))}
              </div>
            </Field>

            {errorMessage && <FieldError>{errorMessage}</FieldError>}
          </FieldGroup>

          <SheetFooter className="px-0 pt-6">
            <div className="flex w-full justify-start gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? 'Guardando...'
                  : isEditing
                    ? 'Guardar cambios'
                    : 'Crear servicio'}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
