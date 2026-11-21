import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { SiteHeader } from '@/components/site-header'
import { Skeleton } from '@/components/ui/skeleton'
import { dashboardContainer } from '@/features/dashboard/infrastructure/dashboard.container'
import { DashboardView } from '@/features/dashboard/presentation/components/dashboard-view'
import { getCurrentUser } from '@/lib/auth'

async function DashboardLoader() {
  const user = await getCurrentUser()

  if (!user || !user.uid) {
    redirect('/login')
  }

  const overview = await dashboardContainer.getDashboardOverview(user.uid)

  return <DashboardView overview={overview} />
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-[480px] rounded-xl" />
        <Skeleton className="h-[480px] rounded-xl" />
      </div>
      <Skeleton className="h-44 rounded-xl" />
    </div>
  )
}

export default function DashboardPage() {
  return (
    <>
      <SiteHeader title="Dashboard" />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardLoader />
      </Suspense>
    </>
  )
}
