export type BillingSubscriptionStatus =
  | "trial"
  | "active"
  | "past_due"
  | "paused"
  | "cancelled";

export type CheckoutRequest = {
  tenantId: string;
  planKey: string;
  priceId: number;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
};

export type CheckoutResult = {
  externalSessionId: string;
  checkoutUrl: string;
  expiresAt?: Date | null;
};

export type SubscriptionEvent = {
  provider: string;
  externalEventId: string;
  tenantId: string;
  planKey: string;
  status: BillingSubscriptionStatus;
  externalCustomerId?: string | null;
  externalSubscriptionId?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
};

export interface BillingProviderAdapter {
  readonly key: string;
  createCheckoutSession(input: CheckoutRequest): Promise<CheckoutResult>;
  verifyWebhook(input: {
    rawBody: Buffer;
    headers: Record<string, string | string[] | undefined>;
  }): Promise<SubscriptionEvent[]>;
}
