# PULSE AI Runtime

## Commercial ownership

Valkiria Project owns the OpenAI API account used by PULSE. Customers do not provide OpenAI keys.

Create a dedicated OpenAI API Project named `Valkiria PULSE Production` and a project-scoped service account for the backend. Keep its key only in the production VPS environment. Use a different project/key for staging.

This gives PULSE one vendor account while tenancy, plans and usage limits remain controlled by PULSE.

## Launch model

Recommended launch profile:

- provider: OpenAI
- base URL: `https://api.openai.com`
- model: `gpt-6-luna`
- max concurrent model calls per API instance: 8
- retry budget: 1 retry for transient HTTP failures
- model usage is measured per tenant and per social platform

The model can be replaced later without changing the Instagram, TikTok or LinkedIn agents because they depend on the internal `AgentModel` contract.

## Tenant isolation

Each request carries only the tenant/brand context required to generate one social post. Social OAuth credentials are never included in model prompts.

AI usage is written to `ai_usage_events` with:

- tenant and brand
- platform
- provider/model
- input, cached-input and output tokens
- provider request ID
- estimated provider cost
- success/failure status

Plan enforcement remains separate through `aiGenerationsPerMonth`.

## Brand training

PULSE does not fine-tune one model per customer.

The effective "training" layer is the tenant Brand Brain plus editorial memory:

1. brand description and tone
2. products and approved claims
3. forbidden terms and CTAs
4. recent posts
5. platform performance signals
6. approval/rejection and editing feedback (future learning loop)

This keeps onboarding cheap and makes a single shared base model usable across many tenants.

## Capacity

The first production instance uses a concurrency gate of 8 model calls. This is sufficient for an initial customer base because social generation is asynchronous/interactive rather than a continuous realtime workload.

As customer count grows:

- keep PULSE stateless at the API layer;
- move the concurrency/rate queue to Redis or a durable job queue before horizontal API scaling;
- route inexpensive copy generation to the default model;
- add a premium model only for plans/features that justify it;
- use provider project budgets plus PULSE tenant limits as two independent cost guards.

## Cost accounting

The production environment stores the current provider price snapshot:

- input USD / 1M tokens
- cached input USD / 1M tokens
- output USD / 1M tokens

Do not hardcode commercial assumptions into plans. Update the environment price snapshot when provider pricing changes.

Internal monthly report:

```bash
npm run ai:usage --workspace @pulse/api
```

This returns aggregate token usage and estimated cost per tenant without exposing internal provider cost in the customer API.

## Production secret setup

Required variables:

```env
PULSE_LLM_PROVIDER=openai
PULSE_LLM_BASE_URL=https://api.openai.com
PULSE_LLM_API_KEY=<project-scoped-service-account-key>
PULSE_LLM_MODEL=gpt-6-luna
PULSE_LLM_MAX_CONCURRENCY=8
PULSE_LLM_MAX_RETRIES=1
```

The key must never be committed, sent to the browser, logged, or copied into prompts.
