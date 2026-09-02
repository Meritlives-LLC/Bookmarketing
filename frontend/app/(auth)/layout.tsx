import Link from "next/link";
import { BookOpen } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Link href="/" className="flex items-center gap-2 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
            <BookOpen className="h-5 w-5" />
          </div>
          <span className="text-xl font-semibold">Kyuka Books</span>
        </Link>
        <div className="space-y-6 text-white">
          <h2 className="text-3xl font-bold leading-tight">
            Your book deserves readers who are already looking for it.
          </h2>
          <p className="text-lg text-brand-200">
            Join authors who stopped guessing and started reaching BookTok, Goodreads, Amazon, and Reddit readers with AI-powered campaigns.
          </p>
        </div>
        <p className="text-sm text-brand-300">© Kyuka Books</p>
      </div>
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2">
        <div className="mx-auto w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
