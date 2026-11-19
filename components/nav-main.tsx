'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

export interface NavMainItem {
  title: string
  url?: string
  icon?: React.ReactNode
  disabled?: boolean
  badgeLabel?: string
}

export function NavMain({ items }: { items: NavMainItem[] }) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => {
            const isDisabled = Boolean(item.disabled || !item.url)
            const isActive =
              !isDisabled &&
              item.url !== undefined &&
              (item.url === '/'
                ? pathname === '/'
                : pathname === item.url || pathname.startsWith(`${item.url}/`))

            if (isDisabled) {
              const badgeText = item.badgeLabel ?? 'Próximamente'
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    type="button"
                    tooltip={`${item.title} (${badgeText})`}
                    disabled
                    aria-disabled="true"
                  >
                    {item.icon}
                    <span className="truncate">{item.title}</span>
                    <span className="ml-auto shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground group-data-[collapsible=icon]:hidden">
                      {badgeText}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            }

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={isActive}
                  render={<Link href={item.url!} />}
                >
                  {item.icon}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
