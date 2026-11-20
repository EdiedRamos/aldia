import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { SiteHeader } from '@/components/site-header'
import { Skeleton } from '@/components/ui/skeleton'
import { contactsContainer } from '@/features/contacts/infrastructure/contacts.container'
import { ContactsView } from '@/features/contacts/presentation/components/contacts-view'
import { getCurrentUser } from '@/lib/auth'

async function ContactsLoader() {
  const user = await getCurrentUser()

  if (!user || !user.uid) {
    redirect('/login')
  }

  const contacts = await contactsContainer.getContacts(user.uid)

  return <ContactsView contacts={contacts} />
}

function ContactsSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-full max-w-md" />
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
      </div>
    </div>
  )
}

export default function ContactosPage() {
  return (
    <>
      <SiteHeader title="Contactos" />
      <Suspense fallback={<ContactsSkeleton />}>
        <ContactsLoader />
      </Suspense>
    </>
  )
}
