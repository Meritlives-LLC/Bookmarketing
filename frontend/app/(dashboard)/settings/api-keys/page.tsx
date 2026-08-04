import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ApiKeysPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6 animate-fade-in">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>
      <h1 className="text-2xl font-bold">API keys</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agency API access</CardTitle>
          <CardDescription>
            API keys are available on the Agency plan for custom integrations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No keys yet. Upgrade to Agency to create keys.</p>
        </CardContent>
      </Card>
    </div>
  );
}
