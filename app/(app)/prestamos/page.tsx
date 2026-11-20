import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { SiteHeader } from '@/components/site-header'
import { Skeleton } from '@/components/ui/skeleton'
import { contactsContainer } from '@/features/contacts/infrastructure/contacts.container'
import { loansContainer } from '@/features/loans/infrastructure/loans.container'
import { LoansBoardView } from '@/features/loans/presentation/components/loans-board-view'
import { getCurrentUser } from '@/lib/auth'

async function LoansBoardLoader() {
  const user = await getCurrentUser()

  if (!user || !user.uid) {
    redirect('/login')
  }

  const [board, contacts] = await Promise.all([
    loansContainer.getLoansBoard(user.uid),
    contactsContainer.getContacts(user.uid),
  ])

  return <LoansBoardView board={board} contacts={contacts} />
}

function LoansBoardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-96 max-w-full" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  )
}

export default function PrestamosPage() {
  return (
    <>
      <SiteHeader title="Préstamos" />
      <Suspense fallback={<LoansBoardSkeleton />}>
        <LoansBoardLoader />
      </Suspense>
    </>
  )
}
