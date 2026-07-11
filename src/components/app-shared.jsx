import { IconPlaceholder } from "@/components/ui/icon-placeholder"

export const navGroups = [
  {
    label: "Navegación",
    items: [
      {
        title: "Dashboard",
        path: "#",
        icon: <IconPlaceholder lucide="LayoutGrid" />,
        isActive: true,
      },
    ],
  },
]

export const navLinks = navGroups.flatMap(g => g.items.flatMap(item =>
  item.subItems?.length ? [item, ...item.subItems] : [item]
))
