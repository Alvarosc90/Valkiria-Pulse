const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export class ApiClientError extends Error {
  code?: string;
  status: number;
  data?: unknown;

  constructor(message: string, status: number, code?: string, data?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

function apiError(response: Response, payload: any, fallback: string) {
  return new ApiClientError(
    payload?.message ?? payload?.error ?? fallback,
    response.status,
    payload?.code ?? payload?.error,
    payload
  );
}

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
    throw apiError(response, payload, "No se pudo iniciar sesión");
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


export async function signupRequest(input: {
  displayName: string;
  companyName: string;
  brandName?: string;
  email: string;
  password: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
}) {
  const response = await fetch(`${API_URL}/api/v1/auth/signup`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw apiError(response, payload, "No se pudo crear la cuenta");
  }

  if (payload?.accessToken) setAccessToken(payload.accessToken);
  return payload;
}

export async function askPublicPulse(question: string) {
  const response = await fetch(`${API_URL}/api/v1/public/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question })
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error ?? "PULSE IA no está disponible");
  }

  return payload?.data?.answer as string | undefined;
}

export async function sendPublicContact(input: {
  name: string;
  company: string;
  email: string;
  phone?: string;
  currentSystem?: string;
  message?: string;
  website?: string;
}) {
  const response = await fetch(`${API_URL}/api/v1/public/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error ?? "No se pudo enviar la consulta");
  }

  return payload?.data;
}


export async function verifyEmailRequest(token: string) {
  const response = await fetch(`${API_URL}/api/v1/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw apiError(response, payload, "No se pudo verificar el email");
  }
  return payload?.data;
}

export async function resendVerificationRequest(email: string) {
  const response = await fetch(`${API_URL}/api/v1/auth/verification/resend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw apiError(response, payload, "No se pudo reenviar la verificación");
  }
  return payload?.data;
}

export async function requestPasswordReset(email: string) {
  const response = await fetch(`${API_URL}/api/v1/auth/password/forgot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw apiError(response, payload, "No se pudo iniciar la recuperación");
  }
  return payload?.data;
}

export async function resetPasswordRequest(token: string, password: string) {
  const response = await fetch(`${API_URL}/api/v1/auth/password/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password })
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw apiError(response, payload, "No se pudo cambiar la contraseña");
  }
  return payload?.data;
}

export async function changePasswordRequest(currentPassword: string, nextPassword: string) {
  return apiJson<{ data: { changed: boolean } }>("/api/v1/auth/password/change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, nextPassword })
  });
}

export async function listSessionsRequest() {
  return apiJson<{ data: Array<{
    id: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
    lastUsedAt: string;
    expiresAt: string;
  }> }>("/api/v1/auth/sessions");
}

export async function revokeSessionRequest(sessionId: string) {
  return apiJson<{ data: { revoked: boolean } }>(
    "/api/v1/auth/sessions/" + encodeURIComponent(sessionId),
    { method: "DELETE" }
  );
}

export async function revokeAllSessionsRequest() {
  return apiJson<{ data: { revoked: number } }>("/api/v1/auth/sessions/revoke-all", {
    method: "POST"
  });
}
