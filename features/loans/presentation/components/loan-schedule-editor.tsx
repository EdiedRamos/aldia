'use client'

import { RotateCcwIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  formatCurrency,
  roundCurrency,
  type LoanInterestModel,
} from '@/features/loans/domain/loan.entity'
import type { CustomInstallmentDraft } from '@/features/loans/domain/loan-schedule.calculator'

interface LoanScheduleEditorProps {
  interestModel: LoanInterestModel
  installments: CustomInstallmentDraft[]
  isCustomized: boolean
  onChange: (nextInstallments: CustomInstallmentDraft[]) => void
  onReset: () => void
  disabled?: boolean
}

export function LoanScheduleEditor({
  interestModel,
  installments,
  isCustomized,
  onChange,
  onReset,
  disabled = false,
}: LoanScheduleEditorProps) {
  const isNoInterest = interestModel === 'NO_INTEREST'

  const totalPrincipal = roundCurrency(
    installments.reduce(
      (acc, item) => acc + (Number(item.principalDue) || 0),
      0
    )
  )
  const totalInterest = roundCurrency(
    installments.reduce(
      (acc, item) => acc + (isNoInterest ? 0 : Number(item.interestDue) || 0),
      0
    )
  )
  const grandTotal = roundCurrency(totalPrincipal + totalInterest)

  function handleFieldChange(
    index: number,
    field: 'dueDate' | 'principalDue' | 'interestDue',
    rawValue: string
  ) {
    const next = installments.map((item, idx) => {
      if (idx !== index) {
        return item
      }
      if (field === 'dueDate') {
        return { ...item, dueDate: rawValue }
      }
      const parsedNumber = Number(rawValue)
      const safeValue =
        Number.isFinite(parsedNumber) && parsedNumber >= 0 ? parsedNumber : 0
      return {
        ...item,
        [field]: safeValue,
      }
    })
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            Previsualización de cuotas ({installments.length})
          </p>
          <p className="text-xs text-muted-foreground">
            Puedes ajustar manualmente la fecha y los montos de cada cuota antes
            de confirmar.
          </p>
        </div>
        {isCustomized && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={disabled}
            className="h-7 px-2 text-xs"
          >
            <RotateCcwIcon className="size-3" />
            <span>Recalcular</span>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg border bg-background/80 p-2.5 text-center">
        <div>
          <p className="text-[11px] text-muted-foreground">Capital</p>
          <p className="text-xs font-semibold tabular-nums">
            {formatCurrency(totalPrincipal)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Intereses</p>
          <p className="text-xs font-semibold tabular-nums">
            {formatCurrency(totalInterest)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Total a cobrar</p>
          <p className="text-xs font-semibold text-primary tabular-nums">
            {formatCurrency(grandTotal)}
          </p>
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border bg-background">
        <table className="w-full text-xs">
          <thead className="sticky top-0 border-b bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">#</th>
              <th className="px-2 py-1.5 text-left font-medium">Fecha</th>
              <th className="px-2 py-1.5 text-right font-medium">Capital</th>
              <th className="px-2 py-1.5 text-right font-medium">Interés</th>
              <th className="px-2 py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {installments.map((inst, index) => {
              const rowTotal = roundCurrency(
                (Number(inst.principalDue) || 0) +
                  (isNoInterest ? 0 : Number(inst.interestDue) || 0)
              )

              return (
                <tr key={index} className="align-middle">
                  <td className="px-2 py-1.5 font-medium text-muted-foreground">
                    {index + 1}
                  </td>
                  <td className="px-1.5 py-1.5">
                    <Input
                      type="date"
                      value={inst.dueDate}
                      onChange={(event) =>
                        handleFieldChange(index, 'dueDate', event.target.value)
                      }
                      disabled={disabled}
                      aria-label={`Fecha cuota ${index + 1}`}
                      className="h-7 min-w-30 px-1.5 text-xs"
                    />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={inst.principalDue}
                      onChange={(event) =>
                        handleFieldChange(
                          index,
                          'principalDue',
                          event.target.value
                        )
                      }
                      disabled={disabled}
                      aria-label={`Capital cuota ${index + 1}`}
                      className="h-7 min-w-22 px-1.5 text-right text-xs tabular-nums"
                    />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={isNoInterest ? 0 : inst.interestDue}
                      onChange={(event) =>
                        handleFieldChange(
                          index,
                          'interestDue',
                          event.target.value
                        )
                      }
                      disabled={disabled || isNoInterest}
                      aria-label={`Interés cuota ${index + 1}`}
                      className="h-7 min-w-20 px-1.5 text-right text-xs tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium whitespace-nowrap tabular-nums">
                    {formatCurrency(rowTotal)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
