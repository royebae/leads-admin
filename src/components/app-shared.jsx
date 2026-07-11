import { IconPlaceholder } from "@/components/ui/icon-placeholder";

export const navGroups = [
	{
		label: "Overview",
		items: [
			{
				title: "Dashboard",
				path: "#/dashboard",
				icon: (
					<IconPlaceholder
                        hugeicons="DashboardSquare01Icon"
                        lucide="LayoutGridIcon"
                        phosphor="SquaresFourIcon"
                        remixicon="RiDashboardLine"
                        tabler="IconLayoutGrid" />
				),
				isActive: true,
			},
			{
				title: "Sales",
				path: "#/sales",
				icon: (
					<IconPlaceholder
                        hugeicons="Analytics02Icon"
                        lucide="BarChart3Icon"
                        phosphor="ChartBarIcon"
                        remixicon="RiBarChartLine"
                        tabler="IconChartBar" />
				),
			},
		],
	},
	{
		label: "Store",
		items: [
			{
				title: "Orders",
				path: "#/orders",
				icon: (
					<IconPlaceholder
                        hugeicons="ShoppingCart01Icon"
                        lucide="ShoppingCartIcon"
                        phosphor="ShoppingCartIcon"
                        remixicon="RiShoppingCartLine"
                        tabler="IconShoppingCart" />
				),
				subItems: [
					{ title: "All orders", path: "#/orders/all" },
					{ title: "Unfulfilled", path: "#/orders/unfulfilled" },
					{ title: "Returns", path: "#/orders/returns" },
				],
			},
			{
				title: "Products",
				path: "#/products",
				icon: (
					<IconPlaceholder
                        hugeicons="File02Icon"
                        lucide="FileTextIcon"
                        phosphor="FileTextIcon"
                        remixicon="RiFileTextLine"
                        tabler="IconFileText" />
				),
				subItems: [
					{ title: "Catalog", path: "#/products/catalog" },
					{ title: "Inventory", path: "#/products/inventory" },
					{ title: "Collections", path: "#/products/collections" },
				],
			},
			{
				title: "Customers",
				path: "#/customers",
				icon: (
					<IconPlaceholder
                        hugeicons="UserMultipleIcon"
                        lucide="UsersIcon"
                        phosphor="UsersIcon"
                        remixicon="RiGroupLine"
                        tabler="IconUsers" />
				),
			},
			{
				title: "Marketing",
				path: "#/marketing",
				icon: (
					<IconPlaceholder
                        hugeicons="Rocket01Icon"
                        lucide="MegaphoneIcon"
                        phosphor="MegaphoneIcon"
                        remixicon="RiMegaphoneLine"
                        tabler="IconPennant" />
				),
			},
		],
	},
	{
		label: "Settings",
		items: [
			{
				title: "Store settings",
				path: "#/store-settings",
				icon: (
					<IconPlaceholder
                        hugeicons="Settings01Icon"
                        lucide="SettingsIcon"
                        phosphor="GearIcon"
                        remixicon="RiSettings3Line"
                        tabler="IconSettings" />
				),
				subItems: [
					{ title: "Store profile", path: "#/store-settings/profile" },
					{ title: "Shipping & delivery", path: "#/store-settings/shipping" },
					{ title: "Payments", path: "#/store-settings/payments" },
					{ title: "Staff", path: "#/store-settings/staff" },
					{ title: "Apps", path: "#/store-settings/apps" },
				],
			},
		],
	},
];

export const footerNavLinks = [
	{
		title: "Seller help",
		path: "#/seller-help",
		icon: (
			<IconPlaceholder
                hugeicons="HelpCircleIcon"
                lucide="HelpCircleIcon"
                phosphor="QuestionIcon"
                remixicon="RiQuestionLine"
                tabler="IconHelpCircle" />
		),
	},
	{
		title: "Platform status",
		path: "#/status",
		icon: (
			<IconPlaceholder
                hugeicons="ActivityIcon"
                lucide="ActivityIcon"
                phosphor="PulseIcon"
                remixicon="RiPulseLine"
                tabler="IconActivity" />
		),
	},
];

export const navLinks = [
	...navGroups.flatMap((group) =>
		group.items.flatMap((item) =>
			item.subItems?.length ? [item, ...item.subItems] : [item])),
	...footerNavLinks,
];
