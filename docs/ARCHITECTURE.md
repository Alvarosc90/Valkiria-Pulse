# Valkiria PULSE architecture

PULSE is an independent multi-tenant SaaS. TrainIA is its first integration, not the owner of its social logic.

## Core flow

Tenant -> Brand Brain -> Platform Agent -> Provider -> Scheduler -> Publication History

## Responsibilities

- Brand Brain: shared brand facts, products, tone, assets, claims and forbidden terms.
- Instagram Agent: isolated Instagram context and editorial memory.
- TikTok Agent: isolated TikTok context and editorial memory.
- LinkedIn Agent: isolated LinkedIn context and editorial memory.
- Social Orchestrator: routes work; it does not contain platform-specific rules.
- Providers: deterministic OAuth, token refresh, upload, publish and status APIs.
- Scheduler: executes approved calendar entries.
- Analytics: prepared as an extension after platform permissions are approved.

## Rule

AI decides what to create. Providers deterministically decide how API calls are executed.
