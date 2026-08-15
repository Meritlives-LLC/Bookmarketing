import { Sidebar, MobileMenuButton } from "@/components/shared/Sidebar";
import { Topbar } from "@/components/shared/Topbar";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { AuthGuard } from "@/components/shared/AuthGuard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen min-h-[100dvh] bg-muted/30">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
            style={{
              paddingTop: "env(safe-area-inset-top, 0px)",
              minHeight: "calc(3.5rem + env(safe-area-inset-top, 0px))",
            }}
          >
            <div className="flex min-w-0 items-center gap-1 sm:gap-2">
              <MobileMenuButton />
              <span className="truncate text-sm font-semibold sm:text-base">
                BookMarketing<span className="text-primary">OS</span>
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <ThemeToggle />
              <NotificationBell />
            </div>
          </header>

          <Topbar />

          <main
            className="flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 md:p-8"
            style={{
              paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
            }}
          >
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}