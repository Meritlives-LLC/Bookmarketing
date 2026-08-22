"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { User } from "@/types";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      try {
        const currentUser = await api.get<User>("/user");

        if (mounted) {
          setUser(currentUser);
        }
      } catch {
        if (mounted) {
          setUser(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadUser();

    return () => {
      mounted = false;
    };
  }, []);

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // Logout is best-effort. The server clears the cookies.
    } finally {
      setUser(null);
      window.location.href = "/login";
    }
  }

  return {
    user,
    loading,
    logout,
    isAuthenticated: !!user,
  };
}