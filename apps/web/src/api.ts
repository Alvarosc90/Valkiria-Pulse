const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(value: string | null) {
  accessToken = value;
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export async function loginRequest(input: {
  email: string;
  password: string;
  tenantSlug?: string;
}) {
  const response = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error ?? "No se pudo iniciar sesion");
  }

  if (!payload.requiresTenantSelection && payload.accessToken) {
    setAccessToken(payload.accessToken);
  }

  return payload;
}

export async function exchangeTrainiaSso(token: string) {
  const response = await fetch(`${API_URL}/api/v1/integrations/trainia/exchange`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      payload?.message ??
        payload?.error ??
        "No se pudo iniciar PULSE desde TrainIA"
    );
  }

  const nextAccessToken = payload?.data?.accessToken;
  if (!nextAccessToken) {
    throw new Error("TrainIA SSO no devolvio una sesion valida");
  }

  setAccessToken(nextAccessToken);
  return payload.data;
}

export async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include"
      });

      if (!response.ok) {
        setAccessToken(null);
        return false;
      }

      const payload = await parseResponse(response);
      if (!payload?.accessToken) {
        setAccessToken(null);
        return false;
      }

      setAccessToken(payload.accessToken);
      return true;
    } catch {
      setAccessToken(null);
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  allowRefresh = true
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include"
  });

  if (response.status === 401 && allowRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiFetch(path, init, false);
  }

  return response;
}

export async function apiJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  const payload = await parseResponse(response);

  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error ?? `HTTP ${response.status}`);
  }

  return payload as T;
}

export async function logoutRequest() {
  try {
    await fetch(`${API_URL}/api/v1/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
  } finally {
    setAccessToken(null);
  }
}
