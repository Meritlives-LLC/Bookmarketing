"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  Sparkles,
  Calendar,
  BarChart3,
  Settings,
  Search,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/books", label: "Books", icon: BookOpen },
  { href: "/audit/new", label: "Audience Audit", icon: Search },
  { href: "/creatives", label: "Creatives", icon: Sparkles },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-4">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                "min-h-[44px]",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
        <button
          type="button"
          className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={async () => {
            try {
              await api.post("/auth/logout");
            } catch {
              // The redirect below still takes the user out of the
              // authenticated UI if the logout request fails.
            } finally {
              window.location.href = "/login";
            }
          }}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Log out
        </button>
      </div>
    </>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // iOS-safe body scroll lock while drawer is open
  useEffect(() => {
    if (!open) return;

    const scrollY = window.scrollY;
    const body = document.body;

    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      left: body.style.left,
      right: body.style.right,
    };

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";

    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;

      window.scrollTo(0, scrollY);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r bg-card md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="h-4 w-4" />
          </div>

          <span className="font-semibold tracking-tight">
            BookMarketing
            <span className="text-primary">OS</span>
          </span>
        </div>

        <NavLinks />
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          style={{
            WebkitTapHighlightColor: "transparent",
          }}
          aria-hidden
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(100%,18rem)] flex-col border-r bg-card shadow-xl transition-transform duration-200 ease-out md:hidden",
          "pt-[env(safe-area-inset-top,0px)]",
          open
            ? "translate-x-0"
            : "-translate-x-full"
        )}
        aria-hidden={!open}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b px-4 sm:h-16">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BookOpen className="h-4 w-4" />
            </div>

            <span className="truncate font-semibold tracking-tight">
              BookMarketing
              <span className="text-primary">OS</span>
            </span>
          </div>

          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <NavLinks
          onNavigate={() => setOpen(false)}
        />
      </aside>

      <MobileMenuBridge
        open={open}
        setOpen={setOpen}
      />
    </>
  );
}

function MobileMenuBridge({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  useEffect(() => {
    function onToggle() {
      setOpen(!open);
    }

    function onOpen() {
      setOpen(true);
    }

    window.addEventListener(
      "bmos:toggle-sidebar",
      onToggle
    );

    window.addEventListener(
      "bmos:open-sidebar",
      onOpen
    );

    return () => {
      window.removeEventListener(
        "bmos:toggle-sidebar",
        onToggle
      );

      window.removeEventListener(
        "bmos:open-sidebar",
        onOpen
      );
    };
  }, [open, setOpen]);

  return null;
}

export function MobileMenuButton() {
  return (
    <button
      type="button"
      className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
      onClick={() =>
        window.dispatchEvent(
          new Event("bmos:open-sidebar")
        )
      }
      aria-label="Open menu"
      style={{
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}