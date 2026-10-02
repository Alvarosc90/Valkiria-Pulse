# PULSE runtime

PULSE starts as a modular monolith plus a dedicated publication worker. This keeps deployment simple while preserving boundaries that can later become services.

## Processes

### API
- Brand Brain
- calendar imports
- dashboard data
- social connection metadata
- manual generation endpoints

### Worker
- polls provider publication states
- claims due calendar entries
- invokes the correct platform agent
- passes generated content to deterministic providers
- persists publication history

## Why not split into microservices yet?

The provider, agent and scheduler boundaries are already packages/modules. We can split them later if load or isolation requires it without forcing distributed-system overhead into the MVP.
