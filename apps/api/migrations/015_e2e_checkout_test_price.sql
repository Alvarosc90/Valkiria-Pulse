UPDATE saas_plan_prices
SET unit_amount_minor = 50000,
    metadata_json = JSON_SET(
      COALESCE(metadata_json, JSON_OBJECT()),
      '$.e2eTestPrice', true,
      '$.e2eTestOriginalAmountMinor', 2490000,
      '$.e2eTestSetAt', UTC_TIMESTAMP()
    )
WHERE plan_key = 'starter'
  AND currency = 'ARS'
  AND billing_interval = 'monthly'
  AND status = 'active';
