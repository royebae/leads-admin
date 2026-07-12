import { IconPlaceholder } from "@/components/ui/icon-placeholder"

export const navGroups = [
  {
    label: "Navegación",
    items: [
      {
        title: "Dashboard",
        path: "#dashboard",
        icon: <IconPlaceholder lucide="LayoutGrid" />,
        isActive: false,
      },
      {
        title: "Reactivación",
        path: "#reactivation",
        icon: <IconPlaceholder lucide="Target" />,
        isActive: false,
      },
    ],
  },
]

export const navLinks = navGroups.flatMap(g => g.items.flatMap(item =>
  item.subItems?.length ? [item, ...item.subItems] : [item]
))
