"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Sparkles,
  Calendar,
  Search,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

// A bottom bar much past ~5-6 targets stops reading as a native tab bar and
// starts looking like an overflowing toolbar. Anything not here (Analytics,
// Settings, Admin, Logout) is still one tap away via the "Menu" tab, which
// opens the existing Sidebar drawer rather than duplicating its contents.
const items = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/books", label: "Books", icon: BookOpen },
  { href: "/audit/new", label: "Audience", icon: Search },
  { href: "/creatives", label: "Creatives", icon: Sparkles },
  { href: "/calendar", label: "Calendar", icon: Calendar },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Primary"
    >
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground"
            )}
            aria-current={active ? "page" : undefined}
          >
            <item.icon
              className="h-5 w-5"
              strokeWidth={active ? 2.5 : 2}
            />
            {item.label}
          </Link>
        );
      })}

      <button
        type="button"
        className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors"
        onClick={() => window.dispatchEvent(new Event("bmos:open-sidebar"))}
        aria-label="Open full menu"
      >
        <Menu className="h-5 w-5" />
        Menu
      </button>
    </nav>
  );
}
