import Link from "next/link";
import { User, CreditCard, Key, Bell, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const links = [
  { href: "/settings/profile", label: "Profile", desc: "Name and account details", icon: User },
  { href: "/settings/billing", label: "Billing", desc: "Plan and payment methods", icon: CreditCard },
  { href: "/settings/api-keys", label: "API keys", desc: "Agency integrations", icon: Key },
  { href: "/settings/notifications", label: "Notifications", desc: "Email alerts and reports", icon: Bell },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account</p>
      </div>
      <div className="space-y-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="mb-2 transition hover:border-primary/30">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <l.icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{l.label}</p>
                  <p className="text-sm text-muted-foreground">{l.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
