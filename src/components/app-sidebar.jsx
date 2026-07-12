"use client"

import { IconPlaceholder } from "@/components/ui/icon-placeholder"
import { LogoIcon } from "@/components/logo"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { NavGroup } from "@/components/nav-group"
import { navGroups } from "@/components/app-shared"
import { LatestChange } from "@/components/latest-change"

export function AppSidebar({ onNavigate }) {
  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader className="h-14 justify-center">
        <SidebarMenuButton asChild>
          <a href="#" onClick={(e) => { e.preventDefault(); onNavigate?.('dashboard') }}>
            <LogoIcon />
            <span className="font-semibold tracking-tight">ELEVATOR</span>
          </a>
        </SidebarMenuButton>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group, index) => (
          <NavGroup key={`sidebar-group-${index}`} {...group} onNavigate={onNavigate} />
        ))}
        <SidebarMenu className="mt-4 px-3">
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="text-muted-foreground text-xs" size="sm">
              <a href="#" onClick={(e) => { e.preventDefault(); sessionStorage.removeItem('leads-admin-auth'); window.location.reload() }}>
                <IconPlaceholder lucide="LogOut" />
                <span>Cerrar sesión</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  )
}
