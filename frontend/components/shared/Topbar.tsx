"use client";

import { CommandPalette } from "@/components/shared/CommandPalette";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

export function Topbar() {
  return (
    <div className="hidden h-16 shrink-0 items-center gap-3 border-b bg-background px-4 lg:gap-4 lg:px-6 md:flex">
      <div className="min-w-0 flex-1">
        <CommandPalette />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle />
        <NotificationBell />
      </div>
    </div>
  );
}