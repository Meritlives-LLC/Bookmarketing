"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { User } from "@/types";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<User>("/user")
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
      })
      .finally(() => setLoading(false));
  }, []);

  function logout() {
    api.post("/auth/logout").catch(() => {
      // Best-effort: cookies may already be expired. Client-side state is
      // cleared regardless so the user is never stuck "logged in" locally.
    });
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setUser(null);
    window.location.href = "/login";
  }

  return { user, loading, logout, isAuthenticated: !!user };
}
