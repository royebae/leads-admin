import { IconPlaceholder } from "@/components/ui/icon-placeholder"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"

const actions = [
  {
    title: "Nuevo lead",
    description: "Registrar nuevo paciente en Elevator",
    href: "#",
    icon: <IconPlaceholder lucide="UserPlus" />,
  },
  {
    title: "Llamar pendientes",
    description: "Contactos con abono sin cita",
    href: "#",
    icon: <IconPlaceholder lucide="PhoneCall" />,
  },
  {
    title: "Campaña SMS",
    description: "Enviar recordatorios de citas",
    href: "#",
    icon: <IconPlaceholder lucide="MessageSquare" />,
  },
  {
    title: "Exportar leads",
    description: "CSV para campaña de reactivación",
    href: "#",
    icon: <IconPlaceholder lucide="Download" />,
  },
]

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Acciones rápidas</CardTitle>
        <CardDescription>Atajos para tareas frecuentes.</CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-0">
          {actions.map((a) => (
            <Item asChild key={a.title} size="sm">
              <a href={a.href}>
                <ItemMedia variant="icon">{a.icon}</ItemMedia>
                <ItemContent>
                  <ItemTitle>{a.title}</ItemTitle>
                  <ItemDescription className="line-clamp-1">
                    {a.description}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <IconPlaceholder lucide="ChevronRight" className="size-4 shrink-0 text-muted-foreground" />
                </ItemActions>
              </a>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}
