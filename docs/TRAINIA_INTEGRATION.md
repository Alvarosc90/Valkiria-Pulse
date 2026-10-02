# TrainIA -> Valkiria PULSE

TrainIA is the first real PULSE client.

## Boundary

TrainIA does not own social provider code. It receives a module/button that opens or embeds the tenant-scoped PULSE experience.

## Initial integration contract

TrainIA supplies:
- external tenant identity
- signed user/session context
- optional brand/event/product facts explicitly authorized for marketing use

PULSE owns:
- social OAuth connections
- Brand Brain
- three platform calendars
- platform agents
- scheduling
- publication history
- future analytics

## UX target

Inside TrainIA:

Marketing -> Redes sociales -> Abrir PULSE

The user must not see access tokens, provider IDs or implementation details.
