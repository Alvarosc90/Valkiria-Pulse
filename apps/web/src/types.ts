export type Platform = "instagram" | "tiktok" | "linkedin";

export type PulseRole = "owner" | "admin" | "editor" | "viewer";

export type CalendarEntry = {
  id: number;
  brandId?: number;
  platform: Platform;
  scheduledAtUtc: string;
  timezone: string;
  topic: string;
  objective?: string;
  angle?: string;
  copySeed?: string;
  cta?: string;
  platformPayload?: Record<string, unknown>;
  status: string;
};

export type AuthContext = {
  userId: string;
  tenantId: string;
  role: PulseRole;
  user: { email: string; displayName: string };
  tenant: { name: string; slug: string };
};

export type Brand = {
  id: number;
  name: string;
  description?: string;
  tone?: string[] | string;
  products?: string[] | string;
  approvedClaims?: string[] | string;
  forbiddenTerms?: string[] | string;
  ctas?: string[] | string;
};

export type SocialAccount = {
  id: number;
  brandId: number;
  platform: Platform;
  accountKind?: string;
  externalAccountId?: string;
  username?: string;
  displayName?: string;
  status: string;
  tokenExpiresAt?: string;
};

export type TenantOption = {
  id: string;
  name: string;
  slug: string;
  role: string;
};
