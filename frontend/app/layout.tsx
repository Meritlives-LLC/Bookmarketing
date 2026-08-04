import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: {
    default: "BookMarketingOS — AI Marketing OS for Authors",
    template: "%s | BookMarketingOS",
  },
  description:
    "Bridge the gap between writing a great book and getting it into readers' hands. AI audience discovery, creative generation, and campaign optimization for authors.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans`}>{children}</body>
    </html>
  );
}
