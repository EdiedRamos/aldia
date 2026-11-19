import { Suspense } from 'react'

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { getCurrentUser } from '@/lib/auth'

async function AppSidebarWithUser() {
  const user = await getCurrentUser()
  return <AppSidebar user={user} variant="inset" />
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
    >
      <Suspense fallback={<AppSidebar variant="inset" />}>
        <AppSidebarWithUser />
      </Suspense>
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
