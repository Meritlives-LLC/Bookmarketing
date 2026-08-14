"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Loader2, Trash2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api/client";
import type { ApiKey, User } from "@/types";
import { formatDate } from "@/lib/utils";

export default function ApiKeysPage() {
  const [user, setUser] = useState<User | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  function load() {
    return Promise.all([api.get<User>("/user"), api.get<ApiKey[]>("/api-keys")]).then(
      ([u, k]) => {
        setUser(u);
        setKeys(k);
      }
    );
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message || "Failed to load API keys"))
      .finally(() => setLoading(false));
  }, []);

  const isAgency = user?.subscription?.plan === "AGENCY";

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const created = await api.post<ApiKey & { rawKey: string }>("/api-keys", { name });
      setRevealedKey(created.rawKey);
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this API key? Any integration using it will stop working immediately.")) return;
    try {
      await api.delete(`/api-keys/${id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to revoke key");
    }
  }

  function copyKey() {
    if (!revealedKey) return;
    navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 animate-fade-in">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>
      <h1 className="text-2xl font-bold">API keys</h1>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {!loading && !isAgency && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agency API access</CardTitle>
            <CardDescription>
              API keys are available on the Agency plan for custom integrations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/settings/billing">
              <Button>Upgrade to Agency</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {!loading && isAgency && (
        <>
          {error && <p className="text-sm text-destructive">{error}</p>}

          {revealedKey && (
            <Card className="border-primary/40 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-base">Save your new key</CardTitle>
                <CardDescription>
                  This is shown only once. Store it somewhere safe — you won&apos;t be able to see it again.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
                    {revealedKey}
                  </code>
                  <Button variant="outline" size="icon" onClick={copyKey}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create a new key</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={createKey} className="flex gap-2">
                <Input
                  placeholder="e.g. Zapier integration"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                />
                <Button type="submit" disabled={creating || !name.trim()} className="shrink-0 gap-2">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Create
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active keys</CardTitle>
            </CardHeader>
            <CardContent>
              {keys.length === 0 ? (
                <p className="text-sm text-muted-foreground">No API keys yet.</p>
              ) : (
                <div className="space-y-2">
                  {keys.map((k) => (
                    <div key={k.id} className="flex items-center justify-between border-b py-3 text-sm last:border-0">
                      <div>
                        <p className="font-medium">{k.name}</p>
                        <p className="text-xs text-muted-foreground">
                          bmos_{k.keyPrefix}… · Created {formatDate(k.createdAt)}
                          {k.lastUsedAt && ` · Last used ${formatDate(k.lastUsedAt)}`}
                        </p>
                      </div>
                      {k.revokedAt ? (
                        <Badge variant="destructive">Revoked</Badge>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => revoke(k.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
