# TrainIA -> Valkiria PULSE

TrainIA is the first real PULSE client while PULSE remains an independent SaaS.

## Boundary

TrainIA does not own social provider code. The club Marketing area exposes an **Open Valkiria PULSE** action. PULSE owns the social workspace, credentials, agents and publication lifecycle.

## SSO flow

1. An authenticated TrainIA owner/admin requests `POST /api/marketing/pulse/launch`.
2. TrainIA signs a short-lived HS256 token containing user and tenant identity.
3. The launch URL places that token in the URL fragment (`#sso=...`) so it is not sent in the initial HTTP request or normal server access logs.
4. PULSE removes the token from the visible URL immediately.
5. The browser exchanges it through `POST /api/v1/integrations/trainia/exchange`.
6. PULSE maps/provisions the external tenant and user, then creates a normal PULSE access/refresh session.
7. All subsequent authorization is enforced by PULSE tenant/RBAC boundaries.

The same independent random secret must be configured on both runtimes:

- TrainIA: `PULSE_SSO_SECRET`
- PULSE: `TRAINIA_SSO_SECRET`

Issuer and audience defaults:
- issuer: `trainia`
- audience: `valkiria-pulse`

The launch token is short lived (TrainIA default: 90 seconds).

## Identity mapping

TrainIA roles map to PULSE roles:
- owner -> owner
- admin / manager / branch_manager -> admin
- reception / coach / nutritionist -> editor
- member / guardian / other -> viewer

PULSE stores the external identity in `external_identities` and the TrainIA tenant mapping in `tenant_links`.

## Product ownership

TrainIA supplies:
- external tenant identity
- signed user/session context
- optional brand/event/product facts explicitly authorized for marketing use

PULSE owns:
- social OAuth connections
- Brand Brain
- three platform calendars
- platform agents
- approvals
- media library
- scheduling
- publication history
- audit log
- future analytics

## UX

Inside TrainIA:

`Marketing -> Redes sociales -> Abrir Valkiria PULSE`

Users never see social access tokens, provider secrets or internal account IDs.
