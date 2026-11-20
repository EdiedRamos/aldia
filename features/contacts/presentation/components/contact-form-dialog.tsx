'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { CameraIcon, LoaderCircleIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { EnrichedContact } from '@/features/contacts/application/get-contacts.use-case'
import {
  formatPhoneDisplay,
  getContactInitials,
} from '@/features/contacts/domain/contact.entity'
import { MAX_CONTACT_PHOTO_SIZE_BYTES } from '@/features/contacts/domain/contact.policy'
import {
  createContactAction,
  updateContactAction,
} from '@/features/contacts/presentation/actions/contact.actions'
import {
  compressImageInBrowser,
  IMAGE_FILE_ACCEPT,
  validateClientUploadFile,
} from '@/lib/utils/image-compression'

const NO_GUARANTOR_VALUE = '__none__'
const CONTACT_PHOTO_MAX_WIDTH = 512

interface ContactFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact?: EnrichedContact | null
  availableGuarantors: EnrichedContact[]
}

export function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  availableGuarantors,
}: ContactFormDialogProps) {
  const isEditing = Boolean(contact)

  const [name, setName] = useState(contact?.name ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [guarantorContactId, setGuarantorContactId] = useState(
    contact?.guarantorContactId ?? NO_GUARANTOR_VALUE
  )
  const [notes, setNotes] = useState(contact?.notes ?? '')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null)
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false)
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    return () => {
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl)
      }
    }
  }, [previewObjectUrl])

  const eligibleGuarantors = availableGuarantors.filter(
    (candidate) =>
      candidate.status === 'ACTIVE' &&
      Boolean(candidate.phone) &&
      candidate.id !== contact?.id
  )

  const selectedGuarantor =
    guarantorContactId !== NO_GUARANTOR_VALUE
      ? (eligibleGuarantors.find((item) => item.id === guarantorContactId) ??
        null)
      : null

  const displayedPhotoUrl =
    previewObjectUrl ?? (!removeExistingPhoto ? contact?.photoUrl : null)

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      return
    }

    const validation = validateClientUploadFile(file, {
      allowPdf: false,
      maxSizeBytes: MAX_CONTACT_PHOTO_SIZE_BYTES,
    })
    if (!validation.ok) {
      event.target.value = ''
      toast.error(validation.error)
      return
    }

    setErrorMessage(null)
    setIsProcessingPhoto(true)

    try {
      const processedFile = await compressImageInBrowser(file, {
        maxWidth: CONTACT_PHOTO_MAX_WIDTH,
        quality: 0.8,
      })

      if (processedFile.size > MAX_CONTACT_PHOTO_SIZE_BYTES) {
        event.target.value = ''
        toast.error('La foto supera el tamaño máximo permitido de 2 MB.')
        return
      }

      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl)
      }

      setSelectedFile(processedFile)
      setPreviewObjectUrl(URL.createObjectURL(processedFile))
      setRemoveExistingPhoto(false)
    } catch (error) {
      event.target.value = ''
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo procesar la foto seleccionada.'
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsProcessingPhoto(false)
    }
  }

  function handleRemovePhoto() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl)
    }
    setSelectedFile(null)
    setPreviewObjectUrl(null)
    setRemoveExistingPhoto(true)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleSheetOpenChange(nextOpen: boolean) {
    if (!nextOpen && previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl)
      setPreviewObjectUrl(null)
    }
    onOpenChange(nextOpen)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()
    const selectedGuarantorId =
      guarantorContactId === NO_GUARANTOR_VALUE ? '' : guarantorContactId

    if (!trimmedName) {
      setErrorMessage('El nombre del contacto es obligatorio.')
      return
    }

    if (!trimmedPhone && !selectedGuarantorId) {
      setErrorMessage(
        'Debes ingresar un teléfono propio o seleccionar un intermediario/codeudor.'
      )
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.set('name', trimmedName)
      formData.set('phone', trimmedPhone)
      formData.set('guarantorContactId', selectedGuarantorId)
      formData.set('notes', notes.trim())

      if (removeExistingPhoto && !selectedFile) {
        formData.set('removePhoto', 'true')
      }

      if (selectedFile) {
        formData.set('photo', selectedFile)
      }

      const result =
        isEditing && contact
          ? await updateContactAction(contact.id, formData)
          : await createContactAction(formData)

      if (!result.ok) {
        setErrorMessage(result.error)
        return
      }

      toast.success(
        isEditing
          ? 'Contacto actualizado correctamente.'
          : 'Contacto creado correctamente.'
      )
      handleSheetOpenChange(false)
    })
  }

  return (
    <Sheet open={open} onOpenChange={handleSheetOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? 'Editar contacto' : 'Nuevo contacto'}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Actualiza la información, intermediario o foto de perfil del contacto.'
              : 'Registra una persona con su teléfono directo o a través de un intermediario de confianza.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col px-4">
          <FieldGroup>
            <Field>
              <FieldLabel>Foto de perfil (opcional)</FieldLabel>
              <div className="flex items-center gap-4 pt-1">
                <Avatar className="size-16">
                  {displayedPhotoUrl && (
                    <AvatarImage
                      src={displayedPhotoUrl}
                      alt={name || 'Avatar del contacto'}
                    />
                  )}
                  <AvatarFallback className="text-base font-medium">
                    {getContactInitials(name || '?')}
                  </AvatarFallback>
                </Avatar>

                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isPending || isProcessingPhoto}
                    >
                      {isProcessingPhoto ? (
                        <LoaderCircleIcon className="size-3.5 animate-spin" />
                      ) : (
                        <CameraIcon className="size-3.5" />
                      )}
                      <span>
                        {isProcessingPhoto
                          ? 'Procesando...'
                          : displayedPhotoUrl
                            ? 'Cambiar foto'
                            : 'Subir foto'}
                      </span>
                    </Button>

                    {displayedPhotoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemovePhoto}
                        disabled={isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2Icon className="size-3.5" />
                        <span>Quitar</span>
                      </Button>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    JPG, PNG o WebP (máx. 2 MB). Se optimiza automáticamente.
                  </span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={IMAGE_FILE_ACCEPT}
                  className="sr-only"
                  onChange={handleFileChange}
                />
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="contact-name">Nombre completo</FieldLabel>
              <Input
                id="contact-name"
                name="name"
                placeholder="Ej. María Fernanda López"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="contact-phone">
                Teléfono (opcional si tiene intermediario)
              </FieldLabel>
              <Input
                id="contact-phone"
                name="phone"
                type="tel"
                placeholder="Ej. 300 123 4567 o +57 300 123 4567"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
              <FieldDescription>
                Los números móviles de 10 dígitos en Colombia se guardan
                automáticamente con prefijo +57.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="contact-guarantor">
                Intermediario / Codeudor (opcional)
              </FieldLabel>
              <Select
                value={guarantorContactId}
                onValueChange={(value) => {
                  if (value !== null) {
                    setGuarantorContactId(value)
                  }
                }}
              >
                <SelectTrigger id="contact-guarantor" className="w-full">
                  <SelectValue placeholder="Sin intermediario">
                    {selectedGuarantor
                      ? `${selectedGuarantor.name}${selectedGuarantor.phone ? ` (${formatPhoneDisplay(selectedGuarantor.phone)})` : ''}`
                      : 'Sin intermediario'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GUARANTOR_VALUE}>
                    Sin intermediario
                  </SelectItem>
                  {eligibleGuarantors.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      <span>{candidate.name}</span>
                      {candidate.phone && (
                        <span className="text-xs text-muted-foreground">
                          ({formatPhoneDisplay(candidate.phone)})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {eligibleGuarantors.length > 0
                  ? 'Úsalo si no tienes el número directo de esta persona y la contactas a través de alguien de confianza.'
                  : 'Agrega primero un contacto con teléfono propio para poder asignarlo como intermediario.'}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="contact-notes">Notas (opcional)</FieldLabel>
              <textarea
                id="contact-notes"
                name="notes"
                rows={3}
                maxLength={500}
                placeholder="Ej. Hermano de Carlos, trabaja en el centro..."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="w-full min-w-0 resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
              />
            </Field>

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
              <Button type="submit" disabled={isPending || isProcessingPhoto}>
                {isPending
                  ? 'Guardando...'
                  : isEditing
                    ? 'Guardar cambios'
                    : 'Crear contacto'}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
