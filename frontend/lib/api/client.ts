// Same-origin by default so this works behind the Next.js rewrite in
// next.config.mjs (`/api/:path*` -> BACKEND_INTERNAL_URL), which is what
// lets one Render (or any single-service host) URL serve both the
// frontend and the API — no separate backend URL/CORS hookup needed.
//
// Only set NEXT_PUBLIC_API_URL when the API genuinely lives on a
// different origin (e.g. local dev without the rewrite, or a split
// two-service deployment). It's a NEXT_PUBLIC_ var, so it's baked into
// the client bundle at build time — an absolute "http://localhost:4000"
// value only ever resolves for whoever's machine that literally is,
// which breaks the moment the built bundle runs anywhere else.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "/api/v1";

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

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/auth/refresh`,
          {
            method: "POST",
            credentials: "include",
          }
        );

        return res.ok;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

const AUTH_FLOW_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/logout",
];

function isAuthFlowPath(path: string): boolean {
  return AUTH_FLOW_PATHS.some((p) =>
    path.startsWith(p)
  );
}

function redirectToLogin() {
  if (typeof window === "undefined") return;

  const redirect =
    `${window.location.pathname}${window.location.search}`;

  window.location.href =
    `/login?redirect=${encodeURIComponent(redirect)}`;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  isRetry = false
): Promise<{
  data: T;
  meta: Record<string, unknown>;
}> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  // Without this, a slow or cold-starting backend leaves the caller's
  // loading state (e.g. a "Saving…" button) spinning indefinitely with
  // no feedback — the browser has no default timeout on same-origin
  // fetches. 20s comfortably covers a Render free-tier cold start.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let res: Response;
  try {
    res = await fetch(
      `${API_BASE}${path}`,
      {
        ...options,
        headers,
        credentials: "include",
        signal: controller.signal,
      }
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(
        "This is taking longer than expected. Please try again.",
        0,
        "TIMEOUT"
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const json = await res
    .json()
    .catch(() => ({}));

  if (!res.ok) {
    const code = json?.error?.code;

    if (
      !isRetry &&
      res.status === 429
    ) {
      await new Promise((resolve) =>
        setTimeout(resolve, 3000)
      );

      return request<T>(
        path,
        options,
        true
      );
    }

    if (
      !isRetry &&
      res.status === 401 &&
      code === "TOKEN_EXPIRED"
    ) {
      const refreshed =
        await refreshAccessToken();

      if (refreshed) {
        return request<T>(
          path,
          options,
          true
        );
      }
    }

    if (
      res.status === 401 &&
      !isAuthFlowPath(path)
    ) {
      redirectToLogin();
    }

    throw new ApiError(
      json?.error?.message ||
        json?.message ||
        "Request failed",
      res.status,
      code
    );
  }

  return {
    data:
      json.data !== undefined
        ? (json.data as T)
        : (json as T),
    meta: json.meta ?? {},
  };
}

export async function apiClient<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { data } =
    await request<T>(
      path,
      options
    );

  return data;
}

export async function apiGetWithMeta<
  T,
  M = Record<string, unknown>
>(
  path: string
): Promise<{
  data: T;
  meta: M;
}> {
  const { data, meta } =
    await request<T>(path);

  return {
    data,
    meta: meta as M,
  };
}

export const api = {
  get: <T>(path: string) =>
    apiClient<T>(path),

  post: <T>(
    path: string,
    body?: unknown
  ) =>
    apiClient<T>(
      path,
      {
        method: "POST",
        body:
          body !== undefined
            ? JSON.stringify(body)
            : undefined,
      }
    ),

  put: <T>(
    path: string,
    body?: unknown
  ) =>
    apiClient<T>(
      path,
      {
        method: "PUT",
        body:
          body !== undefined
            ? JSON.stringify(body)
            : undefined,
      }
    ),

  patch: <T>(
    path: string,
    body?: unknown
  ) =>
    apiClient<T>(
      path,
      {
        method: "PATCH",
        body:
          body !== undefined
            ? JSON.stringify(body)
            : undefined,
      }
    ),

  delete: <T>(path: string) =>
    apiClient<T>(
      path,
      {
        method: "DELETE",
      }
    ),
};

export async function apiDownload(
  path: string,
  fallbackFilename: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}${path}`,
    {
      credentials: "include",
    }
  );

  if (!res.ok) {
    const json = await res
      .json()
      .catch(() => ({}));

    throw new ApiError(
      json?.error?.message ||
        "Download failed",
      res.status,
      json?.error?.code
    );
  }

  const disposition =
    res.headers.get(
      "Content-Disposition"
    ) || "";

  const match =
    disposition.match(
      /filename="?([^"]+)"?/
    );

  const filename =
    match?.[1] ||
    fallbackFilename;

  const blob =
    await res.blob();

  const url =
    URL.createObjectURL(blob);

  const a =
    document.createElement("a");

  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}