'use client'

import * as React from 'react'
import { LoaderCircleIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  isLoading?: boolean
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  isLoading = false,
  onConfirm,
}: ConfirmDialogProps) {
  function handleOpenChange(nextOpen: boolean) {
    if (isLoading) {
      return
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isLoading}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription className="pt-1 text-sm">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading && (
              <LoaderCircleIcon className="size-3.5 animate-spin" />
            )}
            <span>{confirmLabel}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
