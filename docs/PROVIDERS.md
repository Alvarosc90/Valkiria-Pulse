# Social providers

PULSE keeps platform API logic outside the agents.

## TikTok

Current MVP support:
- Direct Post video through PULL_FROM_URL
- SELF_ONLY compatible for unaudited testing
- publish status polling
- creator_info query

## Instagram

Current MVP support:
- single image container
- media publish
- caption

Reels/carousels are separate follow-up adapters.

## LinkedIn

Current MVP support:
- text posts through the REST Posts API
- person or organization author URN supplied by account metadata
- API version pinned in provider code

Organization publishing still depends on the application's approved LinkedIn permissions.

## Boundary

Providers receive credentials through a CredentialResolver. They never expose tokens to agents or browser clients.
