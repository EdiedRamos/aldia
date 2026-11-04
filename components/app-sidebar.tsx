'use client'

import * as React from 'react'

import { NavMain } from '@/components/nav-main'
import { NavUser } from '@/components/nav-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import {
  LayoutDashboardIcon,
  Users,
  BadgeEuro,
  ReceiptText,
  Bot,
  Banknote,
} from 'lucide-react'

const data = {
  navMain: [
    {
      title: 'Dashboard',
      url: '#',
      icon: <LayoutDashboardIcon />,
    },
    {
      title: 'Contactos',
      url: '#',
      icon: <Users />,
    },
    {
      title: 'Préstamos',
      url: '#',
      icon: <Banknote />,
    },
    {
      title: 'Servicios',
      url: '#',
      icon: <ReceiptText />,
    },
    {
      title: 'Bot de WhatsApp',
      url: '#',
      icon: <Bot />,
    },
  ],
}
export function AppSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user?: {
    name: string
    email: string
    avatar: string
  } | null
}) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<a href="#" />}
            >
              <BadgeEuro className="size-5!" />
              <span className="text-base font-semibold">aldia</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        {props.user && <NavUser user={props.user} />}
      </SidebarFooter>
    </Sidebar>
  )
}
