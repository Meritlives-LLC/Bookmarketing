import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: {
    default: "BookMarketingOS — AI Marketing OS for Authors",
    template: "%s | BookMarketingOS",
  },
  description:
    "Bridge the gap between writing a great book and getting it into readers' hands. AI audience discovery, creative generation, and campaign optimization for authors.",
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