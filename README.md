# Valkiria PULSE

Valkiria PULSE is a multi-tenant social media operations SaaS for planning, generating, scheduling and publishing content with platform-specialized agents.

## MVP

- Social Orchestrator
- Instagram Agent
- TikTok Agent
- LinkedIn Agent
- One editorial calendar per platform
- Excel import
- Publication queue and scheduler
- Publication history
- Provider abstraction for each social API
- Tenant/brand separation
- Analytics-ready architecture

## Product principles

1. One shared Brand Brain per tenant.
2. Platform context stays isolated per agent.
3. AI decides what to create; deterministic providers execute API calls.
4. Excel is an input format, not the runtime database.
5. TrainIA will consume PULSE as an external module/client, not duplicate its code.

## Development

Initial development branch: `feature/pulse-mvp`.
