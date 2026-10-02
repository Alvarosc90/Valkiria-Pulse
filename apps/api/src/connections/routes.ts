import { Router } from "express";
import { z } from "zod";
import type { SocialPlatform } from "@pulse/contracts";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { config } from "../config.js";
import { HttpError } from "../http/httpError.js";
import { authorizationUrl, exchangeAuthorizationCode } from "./oauthClients.js";
import { consumeOAuthState, createOAuthState } from "./oauthStateService.js";
import { saveSocialConnection } from "./socialAccountService.js";

const router = Router();
const platformSchema = z.enum(["instagram", "tiktok", "linkedin"]);

function safeReturnTo(value?: string) {
  if (!value) return "/?view=connections";
  if (!value.startsWith("/") || value.startsWith("//")) {
    throw new HttpError("returnTo invalido", 400, "INVALID_RETURN_URL");
  }
  return value.slice(0, 500);
}

function appRedirect(
  returnTo: string | undefined,
  params: Record<string, string>
) {
  const url = new URL(safeReturnTo(returnTo), config.APP_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

router.post(
  "/:platform/start",
  requireAuth,
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const platform = platformSchema.parse(req.params.platform) as SocialPlatform;
      const body = z.object({
        brandId: z.coerce.number().int().positive(),
        returnTo: z.string().max(500).optional()
      }).parse(req.body);

      const state = await createOAuthState({
        tenantId: Number(req.auth!.tenantId),
        brandId: body.brandId,
        userId: Number(req.auth!.userId),
        platform,
        returnTo: safeReturnTo(body.returnTo)
      });

      res.json({
        data: {
          platform,
          authorizationUrl: authorizationUrl(platform, state)
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/:platform/callback", async (req, res, next) => {
  let returnTo: string | undefined;

  try {
    const platform = platformSchema.parse(req.params.platform) as SocialPlatform;
    const query = z.object({
      code: z.string().min(1).optional(),
      state: z.string().min(1),
      error: z.string().optional(),
      error_description: z.string().optional()
    }).parse(req.query);

    const state = await consumeOAuthState(query.state, platform);
    returnTo = state.returnTo;

    if (query.error || !query.code) {
      throw new HttpError(
        query.error_description ?? query.error ?? "Autorizacion cancelada",
        400,
        "OAUTH_DENIED"
      );
    }

    const connection = await exchangeAuthorizationCode(platform, query.code);
    const saved = await saveSocialConnection({
      tenantId: state.tenantId,
      brandId: state.brandId,
      platform,
      ...connection
    });

    res.redirect(
      appRedirect(returnTo, {
        social: platform,
        connection: "success",
        accountId: String(saved.accountId)
      })
    );
  } catch (error) {
    if (error instanceof HttpError) {
      res.redirect(
        appRedirect(returnTo, {
          connection: "error",
          reason: error.code
        })
      );
      return;
    }
    next(error);
  }
});

export default router;
