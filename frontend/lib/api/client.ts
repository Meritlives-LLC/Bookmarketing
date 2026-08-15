const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refreshToken");
}

function setTokens(accessToken: string, refreshToken?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("accessToken", accessToken);
  if (refreshToken) localStorage.setItem("refreshToken", refreshToken);
}

function clearTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

// Access tokens expire after 15 minutes (see backend JWT_ACCESS_EXPIRES_IN).
// When a request comes back with TOKEN_EXPIRED, we transparently refresh
// once and retry, so people aren't silently logged out mid-session.
// Concurrent 401s share a single in-flight refresh instead of each firing
// their own /auth/refresh call.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const refreshToken = getRefreshToken();
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: refreshToken ? JSON.stringify({ refreshToken }) : undefined,
        });
        if (!res.ok) {
          clearTokens();
          return null;
        }
        const json = await res.json().catch(() => ({}));
        const accessToken: string | undefined = json?.data?.accessToken;
        const newRefreshToken: string | undefined = json?.data?.refreshToken;
        if (!accessToken) {
          clearTokens();
          return null;
        }
        setTokens(accessToken, newRefreshToken);
        return accessToken;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

// Endpoints that are themselves part of the auth flow must never trigger
// the auto-redirect-to-login below — a 401 from a bad password on /auth/login
// is a normal form validation result, not "your session died."
const AUTH_FLOW_PATHS = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/forgot-password", "/auth/reset-password", "/auth/logout"];

function isAuthFlowPath(path: string): boolean {
  return AUTH_FLOW_PATHS.some((p) => path.startsWith(p));
}

// A 401 that isn't recoverable via silent refresh (missing token, invalid
// token, or refresh itself failed) means there's no valid session anymore.
// Rather than let every page render its own raw "Authentication token
// missing" error card, clear local state and send the person to /login —
// same destination the middleware/AuthGuard would have sent them to had
// they not had a session to begin with.
function redirectToLogin() {
  if (typeof window === "undefined") return;
  clearTokens();
  const redirect = `${window.location.pathname}${window.location.search}`;
  window.location.href = `/login?redirect=${encodeURIComponent(redirect)}`;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  isRetry = false
): Promise<{ data: T; meta: Record<string, unknown> }> {
  const token = getAccessToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const code = json?.error?.code;

    // One delayed retry on rate limit — status polls should not spam 429 forever
    // and must never clear the session.
    if (!isRetry && res.status === 429) {
      await new Promise((r) => setTimeout(r, 3000));
      return request<T>(path, options, true);
    }

    // Only ever attempt one silent refresh+retry per request to avoid loops.
    if (!isRetry && res.status === 401 && code === "TOKEN_EXPIRED") {
      const newToken = await refreshAccessToken();
      if (newToken) {
        return request<T>(path, options, true);
      }
    }
    // 401 only — never logout on 429 or other errors
    if (res.status === 401 && !isAuthFlowPath(path)) {
      redirectToLogin();
    }
    throw new ApiError(
      json?.error?.message || json?.message || "Request failed",
      res.status,
      code
    );
  }

  return {
    data: (json.data !== undefined ? json.data : json) as T,
    meta: json.meta ?? {},
  };
}

export async function apiClient<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { data } = await request<T>(path, options);
  return data;
}

// Some endpoints (e.g. GET /analytics) return server-computed aggregates in
// `meta` alongside `data`. The default `api.get` discards `meta` for
// backwards compatibility with existing callers, so this variant is opt-in.
export async function apiGetWithMeta<T, M = Record<string, unknown>>(
  path: string
): Promise<{ data: T; meta: M }> {
  const { data, meta } = await request<T>(path);
  return { data, meta: meta as M };
}

export const api = {
  get: <T>(path: string) => apiClient<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiClient<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    apiClient<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => apiClient<T>(path, { method: "DELETE" }),
};

// For endpoints that return a raw file (e.g. Content-Disposition: attachment)
// rather than the {success, data} envelope. Downloads the response as a file
// in the browser instead of parsing it as JSON.
export async function apiDownload(path: string, fallbackFilename: string): Promise<void> {
  const token = getAccessToken();
  const headers: HeadersInit = {};
  if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { headers, credentials: "include" });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new ApiError(json?.error?.message || "Download failed", res.status, json?.error?.code);
  }

  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || fallbackFilename;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}