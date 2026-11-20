'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  BadgeEuro,
  Banknote,
  Bot,
  LayoutDashboardIcon,
  ReceiptText,
  Users,
} from 'lucide-react'

import { NavMain, type NavMainItem } from '@/components/nav-main'
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

const NAV_MAIN_ITEMS: NavMainItem[] = [
  {
    title: 'Dashboard',
    url: '/',
    icon: <LayoutDashboardIcon />,
  },
  {
    title: 'Contactos',
    url: '/contactos',
    icon: <Users />,
  },
  {
    title: 'Préstamos',
    url: '/prestamos',
    icon: <Banknote />,
  },
  {
    title: 'Servicios',
    url: '/servicios',
    icon: <ReceiptText />,
  },
  {
    title: 'Bot de WhatsApp',
    icon: <Bot />,
    disabled: true,
    badgeLabel: 'Próximamente',
  },
]

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
              render={<Link href="/" />}
            >
              <BadgeEuro className="size-5!" />
              <span className="text-base font-semibold">aldia</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={NAV_MAIN_ITEMS} />
      </SidebarContent>
      <SidebarFooter>
        {props.user && <NavUser user={props.user} />}
      </SidebarFooter>
    </Sidebar>
  )
}
