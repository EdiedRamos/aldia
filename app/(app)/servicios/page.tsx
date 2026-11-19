import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { SiteHeader } from '@/components/site-header'
import { Skeleton } from '@/components/ui/skeleton'
import { getServicesBoardUseCase } from '@/features/services/application/get-services-board.use-case'
import { firestoreServiceRepository } from '@/features/services/infrastructure/firestore-service.repository'
import { ServicesBoardView } from '@/features/services/presentation/components/services-board-view'
import { getCurrentUser } from '@/lib/auth'

async function ServicesBoardLoader() {
  const user = await getCurrentUser()

  if (!user || !user.uid) {
    redirect('/login')
  }

  const board = await getServicesBoardUseCase(user.uid, {
    serviceRepository: firestoreServiceRepository,
  })

  return <ServicesBoardView board={board} />
}

function ServicesBoardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
      </div>
    </div>
  )
}

export default function ServiciosPage() {
  return (
    <>
      <SiteHeader title="Servicios" />
      <Suspense fallback={<ServicesBoardSkeleton />}>
        <ServicesBoardLoader />
      </Suspense>
    </>
  )
}
