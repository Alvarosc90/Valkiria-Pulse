# Valkiria PULSE analytics

PULSE normalizes provider metrics into one internal model before exposing them to the product or feeding them back into editorial intelligence.

## Normalized post metrics

The current schema can store:
- impressions
- reach
- views
- likes
- comments
- shares
- saves
- clicks
- follows
- watch time

Each sample is tied to:
- tenant
- brand
- social account
- platform
- external post
- calendar entry/publication job when available
- metric date

## Provider boundary

Analytics uses a separate provider-neutral adapter contract from publishing.

This is deliberate:
- publishing permissions do not imply insights permissions;
- a platform can be publish-capable while Analytics is still unavailable;
- the dashboard must never fake missing provider metrics.

## Unified reporting

The reporting API aggregates metrics by platform and identifies top content using a transparent weighted engagement score.

## Feedback loop

PULSE can rebuild editorial performance signals per brand and platform. These signals are stored separately from the Brand Brain and can later be injected into the matching platform agent only.

This preserves the architectural rule that Instagram, TikTok and LinkedIn editorial contexts stay isolated.

## External blockers

Real data sync still requires platform permissions:
- Instagram insights/metrics permissions
- TikTok analytics/stat permissions
- LinkedIn organization analytics permissions

Until those scopes are approved, Analytics remains fully functional as a schema/reporting/UI layer but correctly displays that no provider metrics have been synchronized.
