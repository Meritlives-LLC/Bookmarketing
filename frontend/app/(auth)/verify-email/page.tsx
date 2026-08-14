"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api/client";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Missing verification token. Use the link from your email.");
      return;
    }
    api
      .post("/auth/verify-email", { token })
      .then(() => setStatus("success"))
      .catch((e) => {
        setStatus("error");
        setError(e instanceof ApiError ? e.message : "Verification failed");
      });
  }, [token]);

  if (status === "verifying") {
    return (
      <div className="flex flex-col items-center text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Verifying your email…</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Email verified</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account is confirmed. You can now sign in.
        </p>
        <Link href="/login" className="mt-6 block w-full">
          <Button className="w-full">Go to login</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <XCircle className="h-7 w-7" />
      </div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Verification failed</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      <Link href="/login" className="mt-6 block w-full">
        <Button variant="outline" className="w-full">
          Back to login
        </Button>
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="text-center text-muted-foreground">Loading…</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
