import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: {
    default: "Kyuka Books — AI Marketing OS for Authors",
    template: "%s | Kyuka Books",
  },
  description:
    "Bridge the gap between writing a great book and getting it into readers' hands. AI audience discovery, creative generation, and campaign optimization for authors.",
  manifest: "/manifest.webmanifest",
  // Standalone display + a status-bar style are what make Safari/Chrome
  // treat an "Add to Home Screen" shortcut as a full-screen app rather than
  // a bookmark that opens back into browser chrome.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Kyuka Books",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Locking maximumScale/userScalable is a deliberate app-feel trade-off:
  // it stops accidental pinch-zoom on tap targets (the way native apps
  // behave) at the cost of zoom for accessibility. Revisit if that
  // trade-off doesn't fit — Sidebar/BottomNav already use 44px+ touch
  // targets specifically so this doesn't leave anything too small to tap.
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a14" },
  ],
};

// Runs before React hydrates so the correct theme class is on <html> from
// the very first paint — avoids a light->dark flash for dark-mode users.
const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var stored = window.localStorage.getItem('bmos-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (prefersDark ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className={`${inter.variable} font-sans`} suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}