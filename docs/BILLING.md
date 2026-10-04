# Valkiria PULSE billing

PULSE separates commercial rules from payment-provider execution so plan limits remain enforceable even if the payment provider changes.

## Launch pricing

Monthly:
- Inicial: ARS 24,900 / USD 19
- Profesional: ARS 59,900 / USD 49
- Business: ARS 119,900 / USD 99

Yearly:
- Inicial: ARS 249,000 / USD 190
- Profesional: ARS 599,000 / USD 490
- Business: ARS 1,199,000 / USD 990

The annual price is equivalent to 10 monthly payments (2 months effectively bonified).
Taxes are not included. Enterprise remains custom quoted.

Prices are stored in `saas_plan_prices`; the landing and in-app catalog reflect the same commercial matrix.

## Implemented product rules

- SaaS plan catalog and entitlements
- tenant subscription state
- 14-day starter trial
- plan usage counters
- server-side limits for brands, social accounts, scheduled posts and AI generation
- trial expiry enforcement
- scheduler stops publishing when the subscription is not active or the trial has expired
- pause, resume and cancellation action workflow
- safe same-currency/same-period plan changes
- audit events for checkout and subscription actions

## Mercado Pago

The production adapter uses Mercado Pago Subscriptions without an associated plan.

Checkout flow:
1. PULSE prepares an idempotent checkout session.
2. The backend creates a pending Mercado Pago `/preapproval`.
3. Mercado Pago returns `init_point`.
4. The user completes payment outside PULSE.
5. Mercado Pago sends signed `subscription_preapproval` and `payment` webhooks.
6. PULSE validates the HMAC signature and then fetches provider state server-to-server.
7. Amount, currency and billing interval are checked against the stored PULSE price before activation.
8. Only a confirmed provider state can activate the tenant subscription.

Webhook endpoint:
`POST /api/v1/webhooks/mercadopago`

Required production secrets:
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `MERCADOPAGO_MODE=production`

PULSE production now fails closed: if `MERCADOPAGO_MODE=production` is selected and either Mercado Pago secret is missing, the API refuses to start and the deployment security preflight fails.

Secrets are server-only. The UI exposes only configured/not-configured state.

## Safety controls

- webhook signature validation uses the provider secret
- webhook events are idempotent
- checkout creation has tenant idempotency keys
- provider amount/currency/frequency mismatch blocks activation
- recurring payment failure can move an active subscription to `past_due`
- expired trials cannot continue publishing
- cancellation/pause/resume are executed against the provider before local state is finalized
- changing currency or billing interval requires a new checkout rather than silently mutating a recurring contract

## Before charging real money

- configure a dedicated PULSE Mercado Pago application/credentials
- configure the webhook secret and subscription/payment notification topics
- test valid and invalid webhook signatures
- test approved, pending and rejected payments
- test duplicate notifications
- test cancellation, pause and resume
- test monthly and yearly amounts
- make one low-value production purchase end-to-end
- verify cancellation/refund/tax terms with the commercial/legal setup


## Premium video add-on

Premium video is deliberately separated from the recurring SaaS plan.

- Text AI remains included up to each plan's `aiGenerationsPerMonth` limit.
- Video is prepaid through tenant Video Credits.
- No plan includes unlimited video.
- Video pack payments are one-time Mercado Pago purchases, not recurring subscriptions.
- Failed video-pack payments do not affect SaaS subscription state.
- Credits are reserved before generation and released if provider generation fails.

Launch packs:
- Video Start: 500 credits — ARS 19,900 / USD 14.90
- Video Creator: 1,500 credits — ARS 52,900 / USD 39.90
- Video Studio: 4,000 credits — ARS 129,900 / USD 99

The internal cost mapping is 100 Video Credits per USD 1 of provider budget. Provider cost and commercial margin are never exposed through the customer API.

Video commerce is fail-closed. `PULSE_VIDEO_COMMERCE_ENABLED=true` is valid only after fal credentials and at least one production-tested video model are enabled.

See `docs/VIDEO_CREDITS.md` for wallet, reservation, provider-funding and margin policy.
