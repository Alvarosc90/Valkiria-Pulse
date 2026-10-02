# PULSE security baseline

PULSE follows the boundary already used in the Valkiria ecosystem: agents plan; deterministic services execute.

## Social credentials

- Access and refresh tokens never enter agent prompts.
- Tokens are encrypted at rest with AES-256-GCM.
- The encryption key is supplied through the runtime secret store.
- API responses never return stored token ciphertext.
- OAuth authorization codes are treated as short-lived and are not persisted after exchange.

## Tenant isolation

Every operational row carries a tenant boundary directly or through a mandatory parent relationship. Queries must always scope by tenant before platform/account identifiers.

## Production

Before production:
- rotate any credentials used during manual sandbox tests;
- configure a production secret store;
- add request authentication and role-based authorization;
- enforce rate limits on OAuth and publication routes;
- enable audit logging for credential and publishing events.
