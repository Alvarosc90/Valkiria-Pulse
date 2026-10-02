# Valkiria PULSE

Valkiria PULSE is a multi-tenant social command center for planning, generating, approving, scheduling and publishing content with platform-specialized agents.

## Current MVP

- Instagram Agent, TikTok Agent and LinkedIn Agent
- Shared Brand Brain with isolated platform prompts
- Per-platform editorial memory and near-duplicate protection
- Three independent Excel calendar formats
- Manual content composer
- Approval workflow
- Media library with temporary provider URLs
- OAuth connection flows for Instagram, TikTok and LinkedIn
- Encrypted social credentials
- Automatic token lifecycle worker
- Publication scheduler and history
- Tenant RBAC and audit log
- TrainIA SSO integration
- Docker production stack with MySQL, worker and automated backups

## Architecture

PULSE starts as a modular monolith plus a dedicated publication worker:

```text
React web
   |
PULSE API
   |-- Auth / tenants / Brand Brain
   |-- OAuth connections
   |-- Calendars / approvals / media
   |-- Social Orchestrator
   |
   +-- Platform agents
   |     |-- Instagram
   |     |-- TikTok
   |     +-- LinkedIn
   |
   +-- Deterministic social providers
   |
MySQL <---- Publication worker
```

Agents decide what to create. Providers execute bounded API calls. Social tokens never enter agent prompts.

## Local development

Requirements:
- Node.js 22+
- MySQL 8+

```bash
cp .env.example .env
npm install
npm run db:migrate --workspace @pulse/api
npm run db:seed:dev --workspace @pulse/api
npm run dev:api
npm run dev:web
```

For an AI-backed agent runtime configure an OpenAI-compatible endpoint through:
- `PULSE_LLM_BASE_URL`
- `PULSE_LLM_MODEL`
- optional `PULSE_LLM_API_KEY`

Without a model endpoint the agents use deterministic development fallbacks.

## Production

Production templates live in `deploy/production`.

Target public URL:

`https://pulse.valkiria.tech`

The production stack includes:
- web reverse-proxy target
- API
- publication/token-refresh worker
- MySQL
- media persistence
- daily database + media backup
- restore smoke test
- security preflight

See `deploy/production/README.md` before deployment.

## TrainIA

TrainIA remains a separate product. Its Marketing module launches PULSE with a short-lived signed SSO token. PULSE maps the TrainIA tenant/user into its own tenancy model and then creates a normal PULSE session.

See `docs/TRAINIA_INTEGRATION.md`.

## Status

Application foundation is implemented and CI validated. Remaining external launch work is production runtime configuration, DNS/reverse proxy, provider redirect registration, LinkedIn organization permission approval, analytics permissions and commercial billing.
