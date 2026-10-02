# PULSE agents

PULSE does not use one generic social prompt.

## Shared context
Every agent receives the tenant's Brand Brain:
- brand description
- tone
- products/services
- approved claims
- forbidden terms
- CTAs

## Isolated platform context

### Instagram Agent
Visual-first. Produces caption, hashtags, CTA and media brief.

### TikTok Agent
Hook-first. Produces title, caption, hook, video concept, script and duration.

### LinkedIn Agent
Professional-context. Produces a structured professional post with restrained hashtags.

## Editorial memory
The runtime can pass recent posts for the same brand and platform. Prompts explicitly require the agent to avoid repeating hooks, openings and structures.

## Model gateway
Agents depend on an `AgentModel` interface. The API currently supplies an OpenAI-compatible HTTP adapter configured by:
- `PULSE_LLM_BASE_URL`
- `PULSE_LLM_MODEL`
- optional `PULSE_LLM_API_KEY`

This keeps the agent layer independent from a specific model vendor and allows local or hosted model gateways.

If no model is configured, agents remain deterministic for development but production publication should use the configured intelligence layer before automatic scheduling is enabled.
