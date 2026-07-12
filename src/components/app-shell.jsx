import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";

export function AppShell({ children, onNavigate }) {
    return (
        <SidebarProvider>
            <AppSidebar onNavigate={onNavigate} />
            <SidebarInset className="p-4 md:p-6">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4">{children}</div>
			</SidebarInset>
        </SidebarProvider>
    );
}
