# Valkiria PULSE · Video Credits

## Commercial model

Premium video is an add-on, not an unlimited feature bundled into the SaaS subscription.

The PULSE subscription pays for:
- workspace and collaboration;
- platform-specialized agents;
- Brand Brain and editorial memory;
- text AI generations within the plan limit;
- planning, approval and publishing workflows.

Premium video is sold separately through prepaid Video Credit packs.

## Credit rule

Internal cost mapping:

- 100 PULSE Video Credits = USD 1 of maximum provider budget.
- 1 PULSE Video Credit = USD 0.01 of provider budget.

This mapping lets PULSE quote different video models without exposing fal.ai prices or internal margin to customers.

Launch provider-price snapshot verified on 2026-10-04:

| Commercial tier | Provider model | Billing | Provider cost | PULSE credits |
| --- | --- | --- | ---: | ---: |
| Fast | Wan 2.5 | per second | USD 0.05/s | 5/s |
| Quality | Kling 2.5 Turbo Pro | per second | USD 0.07/s | 7/s |
| Premium | Veo 3 | per second | USD 0.40/s | 40/s |
| Fast fixed | Ovi | per video | USD 0.20/video | 20/video |

Source of truth for provider prices: https://fal.ai/pricing

Provider pricing can change. Never assume the launch snapshot is permanent. Update `video_model_catalog` before enabling a model if its provider price changes.

## Packs

Launch packs:

| Pack | Credits | Provider budget ceiling | USD price | ARS price |
| --- | ---: | ---: | ---: | ---: |
| Video Start | 500 | USD 5 | USD 14.90 | ARS 19,900 |
| Video Creator | 1,500 | USD 15 | USD 39.90 | ARS 52,900 |
| Video Studio | 4,000 | USD 40 | USD 99 | ARS 129,900 |

Provider budget ceiling is internal. Do not expose it in the customer UI.

The customer sees only:
- pack credits;
- pack price;
- model/tier credit cost;
- quote before generation.

## Funding policy

fal.ai requires credits to be purchased in advance.

PULSE should not buy a large inventory of fal credits before demand exists.

Operating rule:

1. Customer purchases PULSE Video Credits first.
2. Mercado Pago confirms the payment.
3. PULSE credits the tenant wallet.
4. Valkiria keeps only a small operational fal balance.
5. fal balance is increased according to actual consumption, not total outstanding PULSE wallet liability.
6. The initial operating buffer target is USD 25 and can be increased once weekly consumption becomes predictable.

This reduces idle provider balance and protects cash flow.

fal purchased credits expire under the provider's own terms, so provider inventory should remain small and rotate quickly.

## Generation accounting

Before a provider call:

1. PULSE calculates a quote from `video_model_catalog`.
2. Required Video Credits are reserved atomically from the tenant wallet.
3. Only then can the provider request start.

On success:

1. reservation becomes captured;
2. reserved credits are consumed;
3. lifetime consumption is updated;
4. provider/model/generation metadata is written to the ledger.

On provider failure or cancellation:

1. reservation is released;
2. credits return to the tenant's available balance.

The customer must never lose Video Credits because a provider request failed before producing the contracted result.

## Wallet and ledger

Main tables:

- `tenant_video_credit_wallets`
- `video_credit_ledger`
- `video_credit_reservations`
- `video_credit_checkout_sessions`
- `video_credit_packs`
- `video_credit_pack_prices`
- `video_model_catalog`

Purchases and consumption are tenant-isolated.

## Payment flow

Video packs use one-time Mercado Pago checkout, separate from recurring SaaS subscriptions.

Flow:

1. owner/admin selects a pack;
2. PULSE creates a one-time Mercado Pago preference;
3. customer pays;
4. signed Mercado Pago payment webhook arrives;
5. PULSE fetches the payment server-to-server;
6. amount and currency are checked against the stored pack price;
7. credits are added exactly once;
8. duplicate webhooks cannot duplicate credits.

A failed video-pack payment must never change the tenant's SaaS subscription status.

## Safe launch gate

Production variables:

```env
PULSE_VIDEO_COMMERCE_ENABLED=false
PULSE_VIDEO_PROVIDER=fal
FAL_API_KEY=
PULSE_VIDEO_PROVIDER_BUFFER_USD=25
```

Video commerce remains disabled until:
- fal provider credentials are loaded server-side;
- at least one model has `generation_enabled = 1`;
- provider generation has passed end-to-end QA;
- Video Credit checkout has passed one low-value production payment.

PULSE must not sell prepaid credits before it can deliver the generation service.

## Scaling

Initial architecture is appropriate for the first customers.

When usage becomes material:
- monitor provider spend per tenant;
- compare credits sold vs credits consumed;
- track gross margin per pack and model;
- increase provider buffer from real weekly burn;
- add provider redundancy before high-volume agency plans;
- evaluate direct/custom GPU deployments only after serverless model API spend becomes predictable.
