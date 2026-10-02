# Valkiria PULSE billing

The billing layer is intentionally split into product rules and payment-provider execution.

## Implemented

- SaaS plan catalog
- plan limits
- plan entitlements
- tenant subscription state
- default 14-day trial
- monthly usage counters
- real usage snapshot for brands, social accounts and team members
- server-side limits for AI generations, social connections and calendar volume
- provider-neutral checkout/webhook interfaces
- Plan & usage UI

## Commercial pricing

Production prices are intentionally **not seeded**.

This prevents development defaults from becoming accidental commercial policy. A plan can exist without an active price and the UI will show **Consultar**.

Before checkout is enabled, configure the commercial matrix explicitly:

- plan
- currency
- monthly/yearly interval
- amount
- taxes/invoice policy
- trial policy

## Payment provider

The core does not depend on Mercado Pago, Stripe, Paddle or another provider.

A provider adapter must:
- create checkout sessions;
- verify webhook authenticity;
- normalize subscription events;
- never expose provider secrets to the browser;
- update PULSE subscription state idempotently.

## Current plan skeleton

The initial catalog uses:
- Inicial
- Profesional
- Business
- Enterprise

Limits are technical defaults and can be revised before production launch without changing the billing architecture.

## Next decision

Before payment checkout is implemented, product ownership must choose:
1. commercial prices;
2. supported currencies;
3. payment provider;
4. whether trials require a payment method.
