import { config } from "../config.js";

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: config.AUTH_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000
  };
}
