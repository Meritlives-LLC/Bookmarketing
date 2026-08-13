"use client";

import { CommandPalette } from "@/components/shared/CommandPalette";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

export function Topbar() {
  return (
    <div className="hidden h-16 items-center gap-4 border-b bg-background px-6 md:flex">
      <div className="flex-1">
        <CommandPalette />
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <NotificationBell />
      </div>
    </div>
  );
}