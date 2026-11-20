'use client'

import { useState, useTransition } from 'react'
import {
  ArchiveIcon,
  CopyIcon,
  MessageCircleIcon,
  MoreVerticalIcon,
  PencilIcon,
  PhoneIcon,
  UserCheckIcon,
  UsersIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
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
import type { EnrichedContact } from '@/features/contacts/application/get-contacts.use-case'
import {
  buildWhatsAppUrl,
  formatPhoneDisplay,
  getContactInitials,
} from '@/features/contacts/domain/contact.entity'
import { archiveContactAction } from '@/features/contacts/presentation/actions/contact.actions'

interface ContactCardProps {
  contact: EnrichedContact
  onEdit: (contact: EnrichedContact) => void
}

export function ContactCard({ contact, onEdit }: ContactCardProps) {
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false)
  const [isArchiving, startArchiveTransition] = useTransition()

  const isViaGuarantorOnly = !contact.phone && Boolean(contact.guarantor)
  const whatsappUrl = contact.effectivePhone
    ? buildWhatsAppUrl(contact.effectivePhone)
    : null

  async function handleCopyPhone() {
    if (!contact.effectivePhone) {
      return
    }

    try {
      await navigator.clipboard.writeText(contact.effectivePhone)
      toast.success('Teléfono copiado al portapapeles.')
    } catch {
      toast.error('No se pudo copiar el teléfono.')
    }
  }

  function handleConfirmArchive() {
    startArchiveTransition(async () => {
      const result = await archiveContactAction(contact.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setConfirmArchiveOpen(false)
      toast.success(`Contacto "${contact.name}" archivado.`)
    })
  }

  return (
    <>
      <Card className="flex flex-col justify-between">
        <div>
          <CardHeader>
            <div className="flex items-center gap-3 overflow-hidden">
              <Avatar size="lg" className="size-11 shrink-0">
                {contact.photoUrl && (
                  <AvatarImage src={contact.photoUrl} alt={contact.name} />
                )}
                <AvatarFallback className="font-medium">
                  {getContactInitials(contact.name)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <CardTitle className="truncate">{contact.name}</CardTitle>
                {contact.phone ? (
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <PhoneIcon className="size-3 shrink-0" />
                    <span className="truncate">
                      {formatPhoneDisplay(contact.phone)}
                    </span>
                  </p>
                ) : (
                  contact.guarantor?.phone && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <PhoneIcon className="size-3 shrink-0" />
                      <span className="truncate">
                        {formatPhoneDisplay(contact.guarantor.phone)}
                      </span>
                    </p>
                  )
                )}
              </div>
            </div>

            <CardAction>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Opciones del contacto"
                    />
                  }
                >
                  <MoreVerticalIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => onEdit(contact)}>
                    <PencilIcon />
                    Editar
                  </DropdownMenuItem>
                  {contact.effectivePhone && (
                    <DropdownMenuItem onClick={handleCopyPhone}>
                      <CopyIcon />
                      Copiar teléfono
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setConfirmArchiveOpen(true)}
                    disabled={isArchiving}
                  >
                    <ArchiveIcon />
                    Archivar contacto
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardAction>
          </CardHeader>

          <CardContent className="flex flex-col gap-2.5 pt-2">
            {(isViaGuarantorOnly ||
              contact.guarantor ||
              contact.referredCount > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {isViaGuarantorOnly && contact.guarantor && (
                  <Badge
                    variant="outline"
                    className="max-w-full border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  >
                    <UserCheckIcon className="size-3 shrink-0" />
                    <span className="truncate">
                      Vía intermediario: {contact.guarantor.name}
                    </span>
                  </Badge>
                )}

                {!isViaGuarantorOnly && contact.guarantor && (
                  <Badge variant="secondary" className="max-w-full">
                    <UserCheckIcon className="size-3 shrink-0" />
                    <span className="truncate">
                      Codeudor: {contact.guarantor.name}
                    </span>
                  </Badge>
                )}

                {contact.referredCount > 0 && (
                  <Badge variant="outline" className="text-muted-foreground">
                    <UsersIcon className="size-3 shrink-0" />
                    <span>
                      Intermediario de {contact.referredCount}{' '}
                      {contact.referredCount === 1 ? 'contacto' : 'contactos'}
                    </span>
                  </Badge>
                )}
              </div>
            )}

            {contact.notes && (
              <p className="line-clamp-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {contact.notes}
              </p>
            )}
          </CardContent>
        </div>

        <CardFooter className="mt-4 flex items-center justify-between gap-2">
          {whatsappUrl ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
              nativeButton={false}
              render={
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <MessageCircleIcon className="size-3.5" />
              <span>
                {isViaGuarantorOnly ? 'WhatsApp (intermediario)' : 'WhatsApp'}
              </span>
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="flex-1" disabled>
              <MessageCircleIcon className="size-3.5" />
              <span>Sin teléfono</span>
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEdit(contact)}
          >
            <PencilIcon className="size-3.5" />
            <span>Editar</span>
          </Button>
        </CardFooter>
      </Card>

      <ConfirmDialog
        open={confirmArchiveOpen}
        onOpenChange={setConfirmArchiveOpen}
        title={`¿Archivar a "${contact.name}"?`}
        description={
          contact.referredCount > 0
            ? `"${contact.name}" es intermediario activo de ${contact.referredCount} contacto(s). Debes desvincular primero a esos contactos antes de poder archivarlo.`
            : `"${contact.name}" dejará de aparecer en tu directorio de contactos activos, pero sus registros históricos se conservarán intactos.`
        }
        confirmLabel={isArchiving ? 'Archivando...' : 'Archivar contacto'}
        cancelLabel="Cancelar"
        variant="destructive"
        isLoading={isArchiving}
        onConfirm={handleConfirmArchive}
      />
    </>
  )
}
