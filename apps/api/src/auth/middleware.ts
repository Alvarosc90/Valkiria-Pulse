import type { RequestHandler } from "express";
import { HttpError } from "../http/httpError.js";
import type { PulseRole } from "./types.js";
import { resolveAccessToken } from "./service.js";

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.get("authorization") ?? "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new HttpError("Autenticacion requerida", 401, "AUTH_REQUIRED");
    }

    req.auth = await resolveAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(...roles: PulseRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      next(new HttpError("Permisos insuficientes", 403, "AUTH_FORBIDDEN"));
      return;
    }
    next();
  };
}

export const requireTenantMatch: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(new HttpError("Autenticacion requerida", 401, "AUTH_REQUIRED"));
    return;
  }

  const candidates = [
    req.query?.tenantId,
    req.body?.tenantId,
    req.params?.tenantId
  ].filter((value) => value !== undefined && value !== null && String(value) !== "");

  const mismatch = candidates.some((value) => String(value) !== req.auth!.tenantId);
  if (mismatch) {
    next(new HttpError("Acceso cruzado entre empresas bloqueado", 403, "TENANT_BOUNDARY_VIOLATION"));
    return;
  }

  next();
};
