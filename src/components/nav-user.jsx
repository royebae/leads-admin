"use client"

import { IconPlaceholder } from "@/components/ui/icon-placeholder"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { SidebarMenuButton } from "@/components/ui/sidebar"

export function NavUser() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="rounded-full">
          <Avatar className="size-8">
            <AvatarImage alt="Admin" src="" />
            <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xs">AD</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5">
            <Avatar className="size-8">
              <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">AD</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">Admin</span>
              <span className="truncate text-xs text-muted-foreground">Dr. Diente</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <IconPlaceholder lucide="User" />
            Perfil
          </DropdownMenuItem>
          <DropdownMenuItem>
            <IconPlaceholder lucide="Settings" />
            Configuración
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => { sessionStorage.removeItem('leads-admin-auth'); window.location.reload() }}>
          <IconPlaceholder lucide="LogOut" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
