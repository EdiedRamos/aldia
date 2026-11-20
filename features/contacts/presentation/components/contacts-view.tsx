'use client'

import { useState } from 'react'
import { PlusIcon, SearchIcon, UsersIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { EnrichedContact } from '@/features/contacts/application/get-contacts.use-case'
import { ContactCard } from '@/features/contacts/presentation/components/contact-card'
import { ContactFormDialog } from '@/features/contacts/presentation/components/contact-form-dialog'

interface ContactsViewProps {
  contacts: EnrichedContact[]
}

function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function matchesSearchQuery(contact: EnrichedContact, query: string): boolean {
  const normalizedQuery = normalizeForSearch(query.trim())
  if (!normalizedQuery) {
    return true
  }

  const digitsQuery = normalizedQuery.replace(/\D/g, '')

  const nameMatches = normalizeForSearch(contact.name).includes(normalizedQuery)
  if (nameMatches) {
    return true
  }

  if (contact.phone) {
    const phoneNormalized = contact.phone.toLowerCase()
    if (
      phoneNormalized.includes(normalizedQuery) ||
      (digitsQuery.length > 0 &&
        phoneNormalized.replace(/\D/g, '').includes(digitsQuery))
    ) {
      return true
    }
  }

  if (contact.guarantor) {
    if (normalizeForSearch(contact.guarantor.name).includes(normalizedQuery)) {
      return true
    }
    if (contact.guarantor.phone) {
      const guarantorPhone = contact.guarantor.phone.toLowerCase()
      if (
        guarantorPhone.includes(normalizedQuery) ||
        (digitsQuery.length > 0 &&
          guarantorPhone.replace(/\D/g, '').includes(digitsQuery))
      ) {
        return true
      }
    }
  }

  return false
}

export function ContactsView({ contacts }: ContactsViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<EnrichedContact | null>(
    null
  )

  const filteredContacts = contacts.filter((contact) =>
    matchesSearchQuery(contact, searchQuery)
  )

  function handleOpenCreate() {
    setEditingContact(null)
    setFormOpen(true)
  }

  function handleOpenEdit(contact: EnrichedContact) {
    setEditingContact(contact)
    setFormOpen(true)
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-md flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nombre, teléfono o intermediario..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pr-8 pl-8"
            aria-label="Buscar contactos"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Limpiar búsqueda"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {contacts.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {searchQuery.trim()
                ? `${filteredContacts.length} de ${contacts.length} contactos`
                : `${contacts.length} ${contacts.length === 1 ? 'contacto' : 'contactos'}`}
            </span>
          )}
          <Button onClick={handleOpenCreate} size="sm">
            <PlusIcon />
            <span>Nuevo Contacto</span>
          </Button>
        </div>
      </div>

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <UsersIcon className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-base font-medium">
            Aún no tienes contactos registrados
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Agrega a las personas con las que gestionas préstamos, cobros o
            referidos a través de un intermediario de confianza.
          </p>
          <Button onClick={handleOpenCreate} size="sm" className="mt-4">
            <PlusIcon />
            <span>Nuevo Contacto</span>
          </Button>
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <SearchIcon className="size-5 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-base font-medium">
            No encontramos contactos para &ldquo;{searchQuery.trim()}&rdquo;
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Intenta buscar con otro nombre, número de teléfono o el nombre de un
            intermediario.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setSearchQuery('')}
          >
            Limpiar búsqueda
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredContacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onEdit={handleOpenEdit}
            />
          ))}
        </div>
      )}

      {formOpen && (
        <ContactFormDialog
          key={editingContact?.id ?? 'new-contact'}
          open={formOpen}
          onOpenChange={setFormOpen}
          contact={editingContact}
          availableGuarantors={contacts}
        />
      )}
    </div>
  )
}
